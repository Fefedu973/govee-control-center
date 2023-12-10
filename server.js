import express from 'express';
const app = express();
import fetch from 'node-fetch';
import cors from 'cors';

const apiKey = "ENTER YOUR API KEY HERE";
app.use(cors());
app.use(express.json());

// Route for getting devices
app.get("/devices", async (req, res) => {
    const response = await fetch('https://openapi.api.govee.com/router/api/v1/user/devices', {
        method: 'GET',
        host: 'https://developer.govee.com',
        headers: {
            'Content-Type': 'application/json',
            'Govee-API-Key': apiKey
        }
    });
    res.json(await response.json());
});

// Route for querying device state
app.post("/device/state", async (req, res) => {
    try {
        const { sku, device } = req.body.payload;
        const response = await fetch('https://openapi.api.govee.com/router/api/v1/device/state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Govee-API-Key': apiKey
            },
            body: JSON.stringify({
                requestId: 'uuid',
                payload: {
                    sku,
                    device
                }
            })
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error querying device state:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Route for setting device state

app.post("/device/toggle", async (req, res) => {
    try {
        const { sku, device, state } = req.body.payload;
        const response = await fetch('https://openapi.api.govee.com/router/api/v1/device/control', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Govee-API-Key': apiKey
            },
            body: JSON.stringify({
                requestId: 'uuid',
                payload: {
                    sku,
                    device,
                    capability: {
                        type: 'devices.capabilities.on_off',
                        instance: 'powerSwitch',
                        value: state
                    }
                }
            })
        });

        const data = await response.json();
        res.json(data);
        console.log(data);
    } catch (error) {
        console.error('Error setting device state:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Route for setting device color

app.post("/device/color", async (req, res) => {
    try {
        const { sku, device, color } = req.body.payload;
        const response = await fetch('https://openapi.api.govee.com/router/api/v1/device/control', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Govee-API-Key': apiKey
            },
            body: JSON.stringify({
                requestId: 'uuid',
                payload: {
                    sku,
                    device,
                    capability: {
                        type: 'devices.capabilities.color_setting',
                        instance: 'colorRgb',
                        value: color
                    }
                }
            })
        });

        const data = await response.json();
        res.json(data);
        console.log(data);
    } catch (error) {
        console.error('Error setting device state:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Route for setting device brightness

app.post("/device/brightness", async (req, res) => {
    try {
        const { sku, device, brightness } = req.body.payload;
        const response = await fetch('https://openapi.api.govee.com/router/api/v1/device/control', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Govee-API-Key': apiKey
            },
            body: JSON.stringify({
                requestId: 'uuid',
                payload: {
                    sku,
                    device,
                    capability: {
                        type: 'devices.capabilities.range',
                        instance: 'brightness',
                        value: brightness
                    }
                }
            })
        });
        
        const data = await response.json();
        res.json(data);
        console.log(data);
    } catch (error) {
        console.error('Error setting device state:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Route for querying device light scenes

app.post("/device/lightscenes", async (req, res) => {
    try {
        const { sku, device } = req.body.payload;
        const response = await fetch('https://openapi.api.govee.com/router/api/v1/device/scenes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Govee-API-Key': apiKey
            },
            body: JSON.stringify({
                requestId: 'uuid',
                payload: {
                    sku,
                    device
                }
            })
        });

        const data = await response.json();
        res.json(data);
        console.log(data);
    } catch (error) {
        console.error('Error querying device state:', error);
        res.status(500).json({ error: 'Internal Server Error' });

    }
}
);

// Route for querying device DIY light scenes

app.post("/device/diyscenes", async (req, res) => {
    try {
        const { sku, device } = req.body.payload;
        const response = await fetch('https://openapi.api.govee.com/router/api/v1/device/diy-scenes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Govee-API-Key': apiKey
            },
            body: JSON.stringify({
                requestId: 'uuid',
                payload: {
                    sku,
                    device
                }
            })

        });

        const data = await response.json();
        res.json(data);
        console.log(data);
    } catch (error) {
        console.error('Error querying device state:', error);
        res.status(500).json({ error: 'Internal Server Error' });

    }
}
);

// Route for applying scene

app.post("/device/dynamic-scene", async (req, res) => {
    try {
        const { sku, device, scene, instance } = req.body.payload;
        const response = await fetch('https://openapi.api.govee.com/router/api/v1/device/control', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Govee-API-Key': apiKey
            },
            body: JSON.stringify({
                requestId: 'uuid',
                payload: {
                    sku,
                    device,
                    capability: {
                        type: 'devices.capabilities.dynamic_scene',
                        instance: instance, // 'lightScene or diyScene' or 'snapshot'
                        value: scene //id of scene
                    }
                }
            })


        });
        const data = await response.json();
        res.json(data);
        console.log(data);
    }
    catch (error) {
        console.error('Error querying device state:', error);
        res.status(500).json({ error: 'Internal Server Error' });

    }
});

//TODO:
// Segment color control
// Music control

app.listen(3000, () => {
    console.log('server is running at port 3000');
});
