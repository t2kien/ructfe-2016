package cartographer.providers

import cartographer.data.AddressLatencyHistory
import cartographer.data.SynchronizeTimeRequest
import cartographer.data.SynchronizeTimeResponse
import cartographer.helpers.durationBetween
import cartographer.settings.DoubleSetting
import cartographer.settings.IntSetting
import cartographer.settings.SettingsContainer
import cartographer.settings.StringSetting
import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.logging.log4j.LogManager
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.RestTemplate
import java.net.InetSocketAddress
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentMap

@Component
class HistoricalLatencyCalculator : LatencyCalculator {
    companion object {
        private val movingAverageExponentSetting = DoubleSetting("latency_calculator.ema_exponent", 0.2)
        private val backOffExponentSetting = IntSetting("latency_calculater.back_off_exponent", 2)
        private val maxBackOffNumberSetting = IntSetting("latency_calculater.max_back_off_number", 16)
        private val endpointSetting = StringSetting("latency_calculator.endpoint", "timesync")
    }

    private val history: ConcurrentMap<InetSocketAddress, AddressLatencyHistory> =
            ConcurrentHashMap<InetSocketAddress, AddressLatencyHistory>()
    private val logger = LogManager.getFormatterLogger()!!

    private val movingAverageExponent: Double
    private val backOffExponent: Int
    private val maxBackOffNumber: Int
    private val endpoint: String

    private val objectMapper: ObjectMapper
    private val dateTimeProvider: DateTimeProvider

    constructor(dateTimeProvider: DateTimeProvider, objectMapper: ObjectMapper, settingsContainer: SettingsContainer) {
        movingAverageExponent = movingAverageExponentSetting.getValue(settingsContainer)
        backOffExponent = backOffExponentSetting.getValue(settingsContainer)
        maxBackOffNumber = maxBackOffNumberSetting.getValue(settingsContainer)
        endpoint = endpointSetting.getValue(settingsContainer)

        this.objectMapper = objectMapper
        this.dateTimeProvider = dateTimeProvider
    }

    override fun CalcLatency(addr: InetSocketAddress, maxAllowedDuration: Duration): Long? {
        val addressHistory = history.getOrPut(addr, { AddressLatencyHistory(null, 0, 0) })
        val newAddressHistory = calcNewHistory(addr, addressHistory, maxAllowedDuration)
        history.put(addr, newAddressHistory)
        return newAddressHistory.averageLatency
    }

    private fun calcNewHistory(addr: InetSocketAddress,
                               addressHistory: AddressLatencyHistory,
                               maxAllowedDuration: Duration): AddressLatencyHistory {
        if (addressHistory.backOffLeft > 0) {
            return AddressLatencyHistory(addressHistory.backOffLeft - 1, addressHistory.lastBackOff)
        }

        val latency = tryCalcLatency(addr, maxAllowedDuration)

        if (latency != null) {
            if (addressHistory.averageLatency == null) {
                return AddressLatencyHistory(latency)
            }

            val newLatencyValue = latency * movingAverageExponent +
                    addressHistory.averageLatency * (1 - movingAverageExponent)
            return AddressLatencyHistory(newLatencyValue.toLong())
        }

        val newBackOff = Math.min(maxBackOffNumber, Math.max(1, addressHistory.lastBackOff * backOffExponent))
        return AddressLatencyHistory(newBackOff, newBackOff)
    }

    private fun tryCalcLatency(addr: InetSocketAddress, maxAllowedDuration: Duration): Long? {
        try {
            val request = SynchronizeTimeRequest(dateTimeProvider.get())
            val requestSerialized = objectMapper.writeValueAsString(request)
            val responseSerialized = sendRequest(addr, requestSerialized, maxAllowedDuration)

            val response = objectMapper.readValue(responseSerialized, SynchronizeTimeResponse::class.java)

            return if (response != null) calcLatencyFromResponse(response) else null
        } catch (t: Throwable) {
            logger.warn("Failed to synchronize time with $addr due to $t")
            return null
        }
    }

    private fun sendRequest(addr: InetSocketAddress,
                            requestSerialized: String,
                            maxAllowedDuration: Duration): String? {
        val uri = "http://${addr.hostName}:${addr.port}/$endpoint"

        val headers = HttpHeaders()
        headers.add("Content-Type", "application/json")
        headers.add("Accept", "*/*")

        val clientHttpRequestFactory = SimpleClientHttpRequestFactory()
        clientHttpRequestFactory.setConnectTimeout(maxAllowedDuration.toMillis().toInt())
        clientHttpRequestFactory.setReadTimeout(maxAllowedDuration.toMillis().toInt())

        val rest = RestTemplate(clientHttpRequestFactory)
        val requestEntity = HttpEntity<String>(requestSerialized, headers)

        val responseEntity = rest.exchange(uri, HttpMethod.POST, requestEntity, String::class.java)

        if (!responseEntity.statusCode.is2xxSuccessful) {
            return null
        }

        return responseEntity.body
    }

    private fun calcLatencyFromResponse(response: SynchronizeTimeResponse): Long {
        val localDelta = durationBetween(response.sendRequestTime, dateTimeProvider.get())
        val remoteDelta = durationBetween(response.receiveRequestTime, response.sendResponseTime)

        return localDelta.minus(remoteDelta).dividedBy(2).toMillis()
    }
}

