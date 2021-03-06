function tostring_r(t) 
	local result = '\n'
	local function print(s)
		if s == nil then
			s = ''
		end
		result = result .. s .. '\n'
	end
	local cache = {}
	local function sub_print_r(t, indent)
		if cache[tostring(t)] then
			print(indent .. '*' .. tostring(t))
		else
			cache[tostring(t)] = true
			if type(t) == 'table' then
				for pos, val in pairs(t) do
					if type(val) == 'table' then
						print(indent .. '[' .. pos .. '] => ' .. tostring(t) .. ' {')
						sub_print_r(val, indent .. string.rep(' ', string.len(pos) + 8))
						print(indent .. string.rep(' ', string.len(pos) + 6) .. '}')
					elseif type(val) == 'string' then
						print(indent .. '[' .. pos .. '] => "' .. val .. '"')
					else
						print(indent .. '[' .. pos .. '] => ' .. tostring(val))
					end
				end
			else
				print(indent .. tostring(t))
			end
		end
	end

	if type(t) == 'table' then
		print(tostring(t) .. ' {')
		sub_print_r(t, '  ')
		print('}')
	else
		sub_print_r(t, '  ')
	end
	print()
	return result
end

function print_r(t)
	ngx.log(ngx.ERR, tostring_r(t))
end

function log(s)
	ngx.log(ngx.ERR, s)
end
