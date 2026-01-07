const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const vision = require('@google-cloud/vision');

const app = express();

// --- Configuration ---
// Allow requests from anywhere (for now) or specific extension IDs
app.use(cors());

// Increase payload limit for base64 images
app.use(bodyParser.json({ limit: '10mb' }));

// Initialize Google Cloud Vision Client
// This works automatically on Cloud Run if the service account has permissions.
// Locally, it needs GOOGLE_APPLICATION_CREDENTIALS env var.
const client = new vision.ImageAnnotatorClient();

app.post('/ocr', async (req, res) => {
    try {
        const { image } = req.body;

        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }

        // Remove header if present (e.g., "data:image/png;base64,")
        const base64Image = image.replace(/^data:image\/\w+;base64,/, "");
        const request = {
            image: {
                content: base64Image,
            },
            features: [
                {
                    type: 'TEXT_DETECTION', // Optimized for sparse text
                    // type: 'DOCUMENT_TEXT_DETECTION' // Optimized for dense text (books)
                },
            ],
            imageContext: {
                languageHints: ['ja', 'zh', 'ko', 'en'], // Hint languages
            }
        };

        const [result] = await client.annotateImage(request);

        // Return the full result including bounding boxes (fullTextAnnotation)
        // This allows the frontend to do custom sorting/layout analysis
        res.json(result);

    } catch (error) {
        console.error('OCR Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`DeepOverlay OCR Backend listening on port ${port}`);
});
