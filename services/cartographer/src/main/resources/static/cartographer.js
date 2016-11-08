document.getElementById('map-input').onchange = function () {
  document.getElementsByClassName("file-upload")[0].setAttribute("data-text", this.value.split(/(\\|\/)/g).pop());
};

function getMaps() {
    var mapKeys = JSON.parse(localStorage.getItem("mapKeys"));
    if (mapKeys === null) {
        localStorage.setItem("mapKeys", JSON.stringify([]));
        mapKeys = []
    }
    document.getElementsByClassName('maps-title')[0].innerText = "Here are your maps:";
    clearMaps();    
    for (var mapKeyCount = 0; mapKeyCount < mapKeys.length; mapKeyCount++) {
        var mapKey = mapKeys[mapKeyCount];
        getMap(mapKey.key, mapKey.id);
    }
}

function clearMaps(){
    var maps = document.getElementsByClassName('maps')[0];
    while (maps.hasChildNodes()) {
        maps.removeChild(maps.firstChild);
    }
}

function getMap(key, id) {
    var headers = new Headers({
        "Content-Type": "application/json"
    });
    var data = { key: key, id: id }
    return fetch('/images/decrypt', 
        { 
            headers: headers,
            method: 'POST',
            body: JSON.stringify(data)
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(map) {  
            if (map) {
                showMap(map.image)
            }
        })
        .catch(function(err) {});
}

function showMap(map) {
    var image = document.createElement('img');
    image.src = "data:image/png;base64," + btoa(map);
    image.className = "map"
    document.getElementsByClassName("maps")[0].appendChild(image)
}

function addToLocalStorage() {
    var key = document.getElementById("map-key").value;
    var id = document.getElementById("map-id").value;
    if (key !== "" && id !== "") {
        addMapKeyToLocalStorage(key, id);
        getMap(key, id);
    }
}

function addMapKeyToLocalStorage(key, id) {
    var mapKeys = JSON.parse(localStorage.getItem("mapKeys"));
    mapKeys.push({key: key, id: id});
    localStorage.setItem("mapKeys", JSON.stringify(mapKeys));
}

function uploadMap() {
    var reader = new FileReader();
    reader.onload = function() {

        var arrayBuffer = this.result,
        array = new Uint8Array(arrayBuffer),
        binaryString = String.fromCharCode.apply(null, array);
        sendMap(binaryString);
    }
    reader.readAsArrayBuffer(document.getElementById("map-input").files[0]);
}

function sendMap(map) {
    var data = {image: map};
    fetch('/images/encrypt', 
        { 
            method: 'POST',
            body: JSON.stringify(data)
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(mapKey) {  
            if (mapKey) {
                addMapKeyToLocalStorage(mapKey.key, mapKey.id);
                getMap(mapKey.key, mapKey.id);
            }
        })
        .catch(function(err) {
            document.getElementsByClassName('maps-title')[0].innerText = "Can't load this map"
        });
}