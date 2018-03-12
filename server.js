require('colors')
const mqtt = require('mqtt')
const config = require('config')
const ds1820 = require('ds18x20');
const raspiSensors = require('raspi-sensors');
const Gpio = require('onoff').Gpio

const dht22_0 = new raspiSensors.Sensor({type: "DHT22", pin: 0X0}, "dht22_0");
const dht22_1 = new raspiSensors.Sensor({type: "DHT22", pin: 0X1}, "dht22_1");
const dht22_2 = new raspiSensors.Sensor({type: "DHT22", pin: 0X2}, "dht22_2");

const light_sensor = new raspiSensors.Sensor({type: "TSL2561", address: 0X39}, "light_sensor");

const led = new Gpio(22, 'out')
const username = config.get('username')
const token = config.get('token')
const mqtt_url = config.get('mqtt_url')
const device = config.get('device')
const clientId = `${username}/${device}`
const topic = 'api/v1/sensors'
const publishInterval = 7000

const options = {clientId: clientId, username: username, password: token}
const client = mqtt.connect(mqtt_url, options)

const dhtNames = {
  dht22_0: {Temperature: 'dht22_0_temp', Humidity: 'dht22_0_hum'}, 
  dht22_1: {Temperature: 'dht22_1_temp', Humidity: 'dht22_1_hum'},
  dht22_2: {Temperature: 'dht22_2_temp', Humidity: 'dht22_2_hum'}
}

console.log(`Connecting to: ${mqtt_url} with {username: ${username}, token: ${token}}`.yellow)

client.on('connect', () => console.log(`Connected to: ${mqtt_url}`.green))
client.on('error', error => console.error(error))

function fetchLightSensor() { 
  return new Promise((resolve, reject) => {   
    light_sensor.fetch((err, data) => { 
      if(err) return reject(err.cause)
 
      resolve({name: data.sensor_name, data: data.value})
    })
  })
}

function fetchHumiditySensor(dht) {
  return new Promise((resolve, reject) => {
    var oldValue
    
    dht.fetch((err, data) => { 
      if(err) return reject(err) 

      // HACK .fetch() invokes two functions - one for temperature and one for humidity, each one returns an object.  	    
      if (!oldValue) { 
        oldValue = data 
      } else if(oldValue.value || data.value) {
        resolve([
	  {name: dhtNames[oldValue.sensor_name][oldValue.type], data: oldValue.value}, 
	  {name: dhtNames[data.sensor_name][data.type], data: data.value}
	])
      } else {
	resolve(null)
      }
    }) 
  })
}

function fetchTemperatureSensors() { 
  return new Promise((resolve, reject) => { 
    ds1820.getAll((err, data) => {
      if(err) return reject(err) 
      
      var sensorsData = 
        Object.
          keys(data).
	  map((uuid, index) => { 
            if(data[uuid] !== 85) {
              return{name: `ds1820_${index}`, uuid: uuid, data: data[uuid]}
            }
	  })
    
      resolve(sensorsData)
    })
  })
}

const fetchAndPublish = () => {
  Promise.
    all([fetchHumiditySensor(dht22_0), fetchHumiditySensor(dht22_1), fetchHumiditySensor(dht22_2), fetchLightSensor(), fetchTemperatureSensors()]).
    then(results => { 
      led.writeSync(1)
      const sensors = results.reduce((a, b) => a.concat(b), []).filter((result) => result)
      const payload = {device_name: device, sensors: sensors}
      const time = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')
      
      console.log(`[${time}] Publishing to ${topic}: `.yellow + JSON.stringify(payload))
      
      client.publish(topic, JSON.stringify(payload))
      led.writeSync(0)
    }).
    catch(error => console.error(error))
}

setInterval(() => fetchAndPublish(), publishInterval)

