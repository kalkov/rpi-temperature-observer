const ds1820 = require('ds18x20');
const raspiSensors = require('raspi-sensors');

const dht22 = new raspiSensors.Sensor({type: "DHT22", pin: 0X0}, "dht22");
const light_sensor = new raspiSensors.Sensor({type: "TSL2561", address: 0X39}, "light_sensor");

const fetchLightSensor = new Promise((resolve, reject) => {   
  light_sensor.fetch((err, data) => { 
    if(err) return reject(err.cause)

    resolve({name: data.sensor_name, data: data.value})
  })
})

const fetchHumiditySensor = new Promise((resolve, reject) => {
  dht22.fetch((err, data) => { 
    if(err) return reject(err) 

    resolve({name: data.sensor_name, data: data.value})
  }) 
})


const fetchTemperatureSensor = new Promise((resolve, reject) => { 
  ds1820.getAll((err, data) => {
    if(err) return reject(err) 
    
    var sensorsData = 
      Object.
        keys(data).
	map((uuid, index) => { 
          return {name: `ds1820_${index}`, uuid: uuid, data: data[uuid]} 
	})
    
    resolve(sensorsData)
  })
})

const publish = () => {
  Promise.
    all([fetchHumiditySensor, fetchLightSensor, fetchTemperatureSensor]).
    then(results => { 
      const sensors = results.reduce((a, b) => a.concat(b), [])
      console.log(sensors) 
    }).
    catch(error => console.error(error))
}

setInterval(() => publish(), 2000)

