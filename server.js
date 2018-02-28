var ds1820 = require('ds18x20');
var raspiSensors = require('raspi-sensors');

var dht22 = new raspiSensors.Sensor({type: "DHT22", pin: 0X0}, "dht22");
var light_sensor = new raspiSensors.Sensor({type: "TSL2561", address: 0X39}, "light_sensor");

ds1820.list(function (err, listOfDeviceIds) { console.log(listOfDeviceIds) })

var fetchLightSensor =  new Promise(function(resolve, reject) {   
  light_sensor.fetch(function(err, data) {
    if(err) return reject(err.cause)

    resolve({name: data.sensor_name, data: data.value})
   })
})

var fetchHumiditySensor = new Promise(function(resolve, reject) {
  dht22.fetch(function (err, data) { 
    if(err) return reject(err) 

    resolve({name: data.sensor_name, data: data.value})
  }) 
})


var fetchTemperatureSensor = new Promise(function(resolve, reject) { 
  ds1820.getAll(function(err, data) {
    if(err) return reject(err) 
    
    var sensorsData = 
      Object.
        keys(data).
	map(function(sensor_uuid, index) { 
	  return {name: "ds1820_" + index, 
		  uuid: sensor_uuid, 
		  data: data[sensor_uuid]} 
	})
    
    resolve(sensorsData)
  })
})

var publish = function() {
  Promise.
    all([fetchHumiditySensor, fetchLightSensor, fetchTemperatureSensor]).
    then(function(results) { 
      //ES2015 arrays = arrays.reduce((a, b) => a.concat(b), [])
      var sensors = [].concat.apply([], results)
      console.log(sensors) 
    }).
    catch(function(error) { console.error(error) })
}

setInterval(function() { publish() }, 2000)

