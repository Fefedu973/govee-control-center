import express from 'express';
const app = express();
import fetch from 'node-fetch';
import cors from 'cors';

const apiKey = "Enter your API key here";
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

// Route for controlling segment color control

app.post("/device/segment-color", async (req, res) => {
    try {
        const { sku, device, segment, color } = req.body.payload;
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
                        type: 'devices.capabilities.segment_color_setting',
                        instance: 'segmentedColorRgb', // 'segment1 or segment2 or segment3'
                        value: {
                            segment: segment,
                            rgb: color
                        }
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

// Route for toggling gradient

app.post("/device/gradient", async (req, res) => {
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
                        type: 'devices.capabilities.toggle',
                        instance: 'gradientToggle',
                        value: state
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

// Route for changing segment brightness

app.post("/device/segment-brightness", async (req, res) => {
    try {
        const { sku, device, segment, brightness } = req.body.payload;
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
                        type: 'devices.capabilities.segment_color_setting',
                        instance: 'segmentedBrightness', // 'segment1 or segment2 or segment3'
                        value: {
                            segment: segment,
                            brightness: brightness
                        }
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

// control music mode

app.post("/device/music-mode", async (req, res) => {
    try {
        const { sku, device, sensitivity, mode, autoColor, rgbValue } = req.body.payload;
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
                        type: 'devices.capabilities.music_setting',
                        instance: 'musicMode', // 'segment1 or segment2 or segment3'
                        value: {
                            musicMode: mode,
                            sensitivity: sensitivity,
                            autoColor: autoColor,
                            rgb: rgbValue
                        }
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
}
);

app.listen(3000, () => {
    console.log('server is running at port 3000');
});
