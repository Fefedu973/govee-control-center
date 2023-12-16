# Govee Control Center
A powerfull web-based govee products control center based on the new govee api

Pretty much in development ⚠️

Some bugs and incompatibility are to be expected because the govee api is still in development and with bugs and not all devices are supported and I have not implemented everything

## What is working right now ?
- Get the list of all your devices as well as their state (on/off) and their color. (some devices are not supported by the govee api but may be later)
- Toggle the device state (on/off) ✅ ALL DEVICES
- Change device color (some devices are not supported by the govee api but may be later)
- Brightness control (some devices are not working correctly with the govee api but may be later)
- LightScenes and DIY control (early stage bugs are to be expected, some devices are not supported by the govee api but may be later, for an obscure reason some effects dosen't apply)
- Segment color control (works fine)
- Music mode control (bugged for no auto color)
  
## What is planned ?
- Tap to run control integration trough Google assistant/Alexa integration 
- Better UI (for now I focus on core functions but I plan to do a WAY better and beautiful UI/UX
- Easier to use
- Integrations with other services (google assistant, alexa, home assistant)
- All toggle (on/off, All same color, All same scene (to create ambience)
- More devices support (for now I only support lights products from govee beacause I don't have the other connected products from govee so it is verry hard to develop something without being able to test it)
- Logic support (like scratch with blocks) to create senarios based on events (from detectors from govee or other like time in the day)
- Scene creator (save scene with specific light effects on each device to apply different ambience easily)
- Stream deck integration (Maybe partner with the current govee plugin to update functionality and integrate event with streamdeck)
- And even more if I or you have other ideas and if the api allows to do more !

## How to use ?
- Currently tou need to apply for an api key you put in the server.js file in the line 6 to replace Enter your api key here ("const apiKey = "ENTER YOUR API KEY HERE";") see https://developer.govee.com/reference/apply-you-govee-api-key to get your api key
- You need node js on your computer to start the backend server (use this command to start the server (node server.js)
- Host the webpage locally (use vs code to start a live server)
- All of this is temporary the plan is to either made a standalone app or a standalon website accessible for everyone

## Can i help ?
All help is pretty much appreciated. don't hesitate to report bugs/feature request or even do pull request to make the project grow faster !
