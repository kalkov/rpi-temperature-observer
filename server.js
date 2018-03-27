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

const statusLed = new Gpio(22, 'out')
const connectedLed = new Gpio(23, 'out')

const relay_0 = new Gpio(26, 'out')
const relay_1 = new Gpio(20, 'out')
const relay_2 = new Gpio(21, 'out')
const relays = [relay_0, relay_1, relay_2]

const username = config.get('username')
const token = config.get('token')
const mqtt_url = config.get('mqtt_url')
const device = config.get('device')
const clientId = `${username}/${device}`

const deviceTopic = `devices/${device}`
const measurementsTopic = `${deviceTopic}/measurements`
const statusTopic = `${deviceTopic}/status`
const eventTopic = `${deviceTopic}/event`
const commandTopic = `${deviceTopic}/command`

const publishInterval = 30000

const options = {clientId: clientId, username: username, password: token}
const client = mqtt.connect(mqtt_url, options)

const dhtNames = {
  dht22_0: {Temperature: 'dht22_0_temp', Humidity: 'dht22_0_hum'}, 
  dht22_1: {Temperature: 'dht22_1_temp', Humidity: 'dht22_1_hum'},
  dht22_2: {Temperature: 'dht22_2_temp', Humidity: 'dht22_2_hum'}
}

console.log(`${currentTime()} Connecting to: ${mqtt_url} as ${username}`.yellow)

client.on('connect', () => {
  console.log(`${currentTime()} Connected to: ${mqtt_url}`.green)
  connectedLed.writeSync(1)
})

client.on('disconnect', () => {
  console.log(`${currentTime()} Disconnected from: ${mqtt_url}`.red)
  connectedLed.writeSync(0)
})

client.on('error', error => {
  console.error(`${currentTime()} ${error}`)
  connectedLed.writeSync(0)
})

client.subscribe(commandTopic)

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

function fetchRelayState(relayNumber) {
  return new Promise((resolve, reject) => {
    relays[relayNumber].read((err, data) => {
      if(err) return reject(err)
      
      resolve({name: `relay_${relayNumber}`, data: data})
    })
  })
}  

function currentTime() {
  return `[${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')}]`
}

function executeCommand(command) {
  if(command.type === 'change_device') {
    let oldState = relays[command.device].readSync()

    relays[command.device].writeSync(command.state)
    
    let newState = relays[command.device].readSync()

    console.log(`${currentTime()} Current state of relay_${command.device} is ${newState}`.cyan)
    
    let eventPayload = JSON.stringify({type: 'change_device', device: command.device, new_state: newState, old_state: oldState})
    console.log(`${currentTime()} Publishing to ${eventTopic}: `.yellow + eventPayload)
    client.publish(eventTopic, eventPayload)
  }
}

const fetchAndPublish = () => {
  Promise.
    all([fetchHumiditySensor(dht22_0), 
	 fetchHumiditySensor(dht22_1), 
	 fetchHumiditySensor(dht22_2), 
	 fetchLightSensor(), 
	 fetchTemperatureSensors(),
         fetchRelayState(0),
         fetchRelayState(1),
         fetchRelayState(2)]).
    then(results => { 
      statusLed.writeSync(1)
      
      const sensors = results.reduce((a, b) => a.concat(b), []).filter((result) => result)
      const measurementsPayload = JSON.stringify({sensors: sensors}) 
      console.log(`${currentTime()} Publishing to ${measurementsTopic}: `.yellow + measurementsPayload)
      
      client.publish(measurementsTopic, measurementsPayload)
      statusLed.writeSync(0)
    }).
    catch(error => console.error(error))
}

client.on('message', (topic, message) => {
  console.log(`${currentTime()} Received command: ${message}`.magenta)
  let command = JSON.parse(message.toString())
  executeCommand(command)
})
	
setInterval(() => fetchAndPublish(), publishInterval)

