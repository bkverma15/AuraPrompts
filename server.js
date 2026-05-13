const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Storage for AI-generated / uploaded images
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp|gif/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) cb(null, true);
        else cb(new Error('Only image files are allowed!'));
    }
});

app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data.json');
const CATS_FILE  = path.join(__dirname, 'categories.json');
// Uses environment variable for production, falls back to the hardcoded key for local dev
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDavmoyn811nCVztXZ9PQE4RfPtShYKmrU';

// Helper: read/write categories
function readCats()  { return JSON.parse(fs.readFileSync(CATS_FILE,  'utf8')); }
function writeCats(d){ fs.writeFileSync(CATS_FILE,  JSON.stringify(d, null, 2)); }
function readData()  { return JSON.parse(fs.readFileSync(DATA_FILE,  'utf8')); }
function writeData(d){ fs.writeFileSync(DATA_FILE,  JSON.stringify(d, null, 2)); }

// Helper: call Gemini API
async function callGemini(payload) {
    const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        payload,
        { headers: { 'Content-Type': 'application/json' } }
    );
    return res.data.candidates[0].content.parts[0].text;
}

// ─────────────────────────────────────────────
// GET all prompts
// ─────────────────────────────────────────────
app.get('/api/prompts', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read data' });
        res.json(JSON.parse(data));
    });
});

// ─────────────────────────────────────────────
// POST /api/magic  — text idea → AI → image → publish
// ─────────────────────────────────────────────
app.post('/api/magic', async (req, res) => {
    try {
        const { basePrompt, tag, categoryOverride } = req.body;

        const instruction = `You are an expert AI prompt engineer. The user gave this basic idea: "${basePrompt}".
Rewrite this into a highly detailed, extremely realistic image generation prompt.
Also provide a catchy Title and choose ONE Category from: Girl Prompt, Boys Prompt, Birthday Prompt, Cinematic, Portraits, Trending Prompts.

Return ONLY valid JSON (no markdown), like:
{"altered_prompt":"...","title":"...","category":"..."}`;

        let aiData;
        try {
            const text = await callGemini({
                contents: [{ parts: [{ text: instruction }] }],
                generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
            });
            aiData = JSON.parse(text);
        } catch (e) {
            console.log('Gemini text fallback:', e.message);
            aiData = {
                altered_prompt: basePrompt + ', highly detailed, photorealistic, cinematic lighting, 8k, masterpiece.',
                title: basePrompt.split(' ').slice(0, 6).join(' ') + ' AI Prompt',
                category: 'Trending Prompts'
            };
        }

        // Generate image via Pollinations Flux
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(aiData.altered_prompt)}?width=800&height=1000&nologo=true&model=flux&enhance=true`;
        const imageResponse = await axios({ method: 'get', url: imageUrl, responseType: 'stream' });

        const filename = `magic-${Date.now()}.jpg`;
        const filepath = path.join(__dirname, 'public', 'uploads', filename);
        const writer = fs.createWriteStream(filepath);
        imageResponse.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const newPrompt = {
            id: Date.now().toString(),
            title: aiData.title,
            prompt: aiData.altered_prompt,
            category: categoryOverride || aiData.category,
            image: 'uploads/' + filename,
            tag: tag || 'Latest',
            source: 'magic'
        };

        const currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        currentData.unshift(newPrompt);
        fs.writeFileSync(DATA_FILE, JSON.stringify(currentData, null, 2));

        res.json({ success: true, data: newPrompt });

    } catch (error) {
        console.error('Magic error:', error.message);
        res.status(500).json({ error: 'Failed to generate: ' + error.message });
    }
});

// ─────────────────────────────────────────────
// POST /api/analyze-image — upload image → Gemini Vision → generate prompt → publish
// ─────────────────────────────────────────────
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    try {
        const tag = req.body.tag || 'Latest';
        const categoryOverride = req.body.categoryOverride || '';
        const imageBuffer = fs.readFileSync(req.file.path);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = req.file.mimetype;

        // Ask Gemini Vision to analyze the image and generate structured data
        const visionInstruction = `You are a world-class AI image analyst and professional prompt engineer specializing in hyper-realistic AI image generation.

Analyze this uploaded image VERY carefully — every detail matters.

Your task:
1. Write an EXTREMELY LONG, DETAILED and PROFESSIONAL image generation prompt (minimum 5-8 sentences) that would perfectly recreate this image. You MUST cover ALL of the following in your prompt:
   - SUBJECT: Describe the person/subject in maximum detail (age, skin tone, hair color, hair style, hair texture, eye color, expression, facial features, makeup details if any, accessories)
   - SCENE/BACKGROUND: Describe the environment, background, setting, location, weather, time of day
   - POSE & BODY LANGUAGE: Describe the pose, hand position, body angle, direction of gaze
   - CLOTHING: Describe outfit, fabric, color, style in detail
   - LIGHTING: Describe the lighting setup (cinematic, natural, golden hour, studio, etc.)
   - MOOD & ATMOSPHERE: Describe the overall feel and emotional tone of the image
   - PHOTOGRAPHY STYLE: Include technical details like lens type, depth of field, camera angle, shot type (close-up, portrait, full body, etc.)
   - END the prompt with these exact quality tags: "Take Face From Uploaded Image Keep Same 100%, highly detailed, extremely realistic, masterpiece, 8k resolution, cinematic lighting, trending on artstation, ultra-detailed, sharp focus, professional photography, award-winning."

2. Write a catchy, specific, descriptive title (not generic).
3. Choose ONE category from this exact list: Girl Prompt, Boys Prompt, Birthday Prompt, Cinematic, Portraits, Trending Prompts.

EXAMPLE of the prompt length and quality expected:
"Hyper mega ultra realistic high-quality cozy portrait maintaining maximum possible physiognomy and details of the person in the photo, without altering skin color or age. A young woman stands behind a rain-covered window glass where it is raining and there are water droplets splashing on the glass, she is leaning with one hand on the glass and looking intensely at the camera, with her wavy blonde hair parted in the middle and pushed back, impeccable sophisticated makeup and a lip gloss, wearing a single-shoulder black top, soft bokeh background blurring the rainy street outside, warm indoor ambient lighting contrasting with the cold rain, portrait shot at 85mm, shallow depth of field emphasizing her face. Take Face From Uploaded Image Keep Same 100%, highly detailed, extremely realistic, masterpiece, 8k resolution, cinematic lighting, trending on artstation, ultra-detailed, sharp focus, professional photography, award-winning."

Return ONLY valid JSON (no markdown, no explanation), exactly like this:
{"prompt":"your ultra long detailed prompt here","title":"catchy title here","category":"chosen category"}`;

        const visionPayload = {
            contents: [{
                parts: [
                    { text: visionInstruction },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.6
                // No responseMimeType for multimodal — it can cause 400 errors
            }
        };

        let aiData;
        try {
            // Use gemini-1.5-pro for better vision analysis
            const visionRes = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
                visionPayload,
                { headers: { 'Content-Type': 'application/json' } }
            );
            let rawText = visionRes.data.candidates[0].content.parts[0].text;
            // Strip markdown code fences if present
            rawText = rawText.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
            // Extract JSON object using regex in case there's extra text
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON found in response');
            aiData = JSON.parse(jsonMatch[0]);
            console.log('Vision AI success:', aiData.title);
        } catch (e) {
            console.log('Vision API fallback used:', e.message);
            aiData = {
                prompt: 'Hyper realistic ultra detailed portrait photograph. The subject is captured with extraordinary attention to detail — skin texture, hair strands, eyes reflection all visible. Natural ambient lighting with cinematic mood. Take Face From Uploaded Image Keep Same 100%, highly detailed, extremely realistic, masterpiece, 8k resolution, cinematic lighting, trending on artstation, ultra-detailed, sharp focus, professional photography, award-winning.',
                title: 'Ultra Realistic AI Portrait Prompt',
                category: 'Portraits'
            };
        }

        // Save image to uploads (it's already there from multer)
        const savedImagePath = 'uploads/' + req.file.filename;

        const newPrompt = {
            id: Date.now().toString(),
            title: aiData.title,
            prompt: aiData.prompt,
            category: categoryOverride || aiData.category,
            image: savedImagePath,
            tag: tag,
            source: 'image-analysis'
        };

        const currentData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        currentData.unshift(newPrompt);
        fs.writeFileSync(DATA_FILE, JSON.stringify(currentData, null, 2));

        res.json({ success: true, data: newPrompt });

    } catch (error) {
        console.error('Image analysis error:', error.message);
        // Clean up file if something went wrong
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Failed to analyze image: ' + error.message });
    }
});

// ─────────────────────────────────────────────
// PUT /api/prompts/:id/image — replace image (+ optional re-analyze)
// ─────────────────────────────────────────────
app.put('/api/prompts/:id/image', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    const promptId = req.params.id;
    const reAnalyze = req.body.reAnalyze === 'true';

    try {
        const prompts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const idx = prompts.findIndex(p => p.id === promptId);
        if (idx === -1) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Prompt not found' });
        }

        // Delete old image if it was an upload
        const oldImage = prompts[idx].image;
        if (oldImage && oldImage.startsWith('uploads/')) {
            const oldPath = path.join(__dirname, 'public', oldImage);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        // Set new image path
        const newImagePath = 'uploads/' + req.file.filename;
        prompts[idx].image = newImagePath;

        // Optionally re-analyze with Gemini Vision
        if (reAnalyze) {
            try {
                const imageBuffer = fs.readFileSync(req.file.path);
                const base64Image = imageBuffer.toString('base64');
                const mimeType = req.file.mimetype;

                const visionInstruction = `You are a world-class AI image analyst and professional prompt engineer specializing in hyper-realistic AI image generation.

Analyze this uploaded image VERY carefully — every detail matters.

Your task:
1. Write an EXTREMELY LONG, DETAILED and PROFESSIONAL image generation prompt (minimum 5-8 sentences) covering: subject details, scene/background, pose, clothing, lighting, mood, atmosphere, photography style. END with: "Take Face From Uploaded Image Keep Same 100%, highly detailed, extremely realistic, masterpiece, 8k resolution, cinematic lighting, trending on artstation, ultra-detailed, sharp focus, professional photography, award-winning."
2. Write a catchy, specific, descriptive title.
3. Choose ONE category: Girl Prompt, Boys Prompt, Birthday Prompt, Cinematic, Portraits, Trending Prompts.

Return ONLY valid JSON:
{"prompt":"...","title":"...","category":"..."}`;

                const visionRes = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        contents: [{ parts: [{ text: visionInstruction }, { inline_data: { mime_type: mimeType, data: base64Image } }] }],
                        generationConfig: { temperature: 0.6 }
                    },
                    { headers: { 'Content-Type': 'application/json' } }
                );

                let rawText = visionRes.data.candidates[0].content.parts[0].text;
                rawText = rawText.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const aiData = JSON.parse(jsonMatch[0]);
                    prompts[idx].prompt = aiData.prompt;
                    prompts[idx].title = aiData.title;
                    prompts[idx].category = aiData.category;
                    console.log('Re-analysis success:', aiData.title);
                }
            } catch (e) {
                console.log('Re-analysis fallback:', e.message);
                // Keep old prompt/title/category, only image changes
            }
        }

        fs.writeFileSync(DATA_FILE, JSON.stringify(prompts, null, 2));
        res.json({ success: true, data: prompts[idx] });

    } catch (error) {
        console.error('Replace image error:', error.message);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed to replace image: ' + error.message });
    }
});

// ─────────────────────────────────────────────
// PATCH /api/prompts/:id/category
// ─────────────────────────────────────────────
app.patch('/api/prompts/:id/category', (req, res) => {
    const promptId = req.params.id;
    const { category } = req.body;
    
    if (!category) return res.status(400).json({ error: 'Category required' });

    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read data' });

        let prompts = JSON.parse(data);
        const idx = prompts.findIndex(p => p.id === promptId);
        if (idx === -1) return res.status(404).json({ error: 'Prompt not found' });

        prompts[idx].category = category;
        
        fs.writeFile(DATA_FILE, JSON.stringify(prompts, null, 2), (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save data' });
            res.json({ success: true, data: prompts[idx] });
        });
    });
});

// ─────────────────────────────────────────────
// DELETE /api/prompts/:id
// ─────────────────────────────────────────────
app.delete('/api/prompts/:id', (req, res) => {
    const promptId = req.params.id;
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read data' });

        let prompts = JSON.parse(data);
        const idx = prompts.findIndex(p => p.id === promptId);
        if (idx === -1) return res.status(404).json({ error: 'Prompt not found' });

        const imagePath = prompts[idx].image;
        if (imagePath && imagePath.startsWith('uploads/')) {
            const fullPath = path.join(__dirname, 'public', imagePath);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }

        prompts.splice(idx, 1);
        fs.writeFile(DATA_FILE, JSON.stringify(prompts, null, 2), (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save data' });
            res.json({ success: true });
        });
    });
});

// ─────────────────────────────────────────────
// CATEGORY ENDPOINTS
// ─────────────────────────────────────────────

// GET all categories
app.get('/api/categories', (req, res) => {
    try { res.json(readCats()); }
    catch(e) { res.status(500).json({ error: 'Failed to read categories' }); }
});

// POST — create new category
app.post('/api/categories', (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    const trimmed = name.trim();
    try {
        const cats = readCats();
        if (cats.some(c => c.toLowerCase() === trimmed.toLowerCase()))
            return res.status(409).json({ error: 'Category already exists' });
        cats.push(trimmed);
        writeCats(cats);
        res.json({ success: true, categories: cats });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT — rename category (updates all prompts too)
app.put('/api/categories/:name', (req, res) => {
    const oldName = decodeURIComponent(req.params.name);
    const { newName } = req.body;
    if (!newName || !newName.trim()) return res.status(400).json({ error: 'New name required' });
    const trimmed = newName.trim();
    try {
        const cats = readCats();
        const idx = cats.findIndex(c => c === oldName);
        if (idx === -1) return res.status(404).json({ error: 'Category not found' });
        if (cats.some((c, i) => i !== idx && c.toLowerCase() === trimmed.toLowerCase()))
            return res.status(409).json({ error: 'Name already taken' });
        cats[idx] = trimmed;
        writeCats(cats);
        // Update all prompts with the old category name
        const prompts = readData();
        prompts.forEach(p => { if (p.category === oldName) p.category = trimmed; });
        writeData(prompts);
        res.json({ success: true, categories: cats });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE — remove category (prompts get category = 'Uncategorized')
app.delete('/api/categories/:name', (req, res) => {
    const name = decodeURIComponent(req.params.name);
    try {
        let cats = readCats();
        if (!cats.includes(name)) return res.status(404).json({ error: 'Category not found' });
        cats = cats.filter(c => c !== name);
        writeCats(cats);
        // Uncategorize affected prompts
        const prompts = readData();
        prompts.forEach(p => { if (p.category === name) p.category = 'Uncategorized'; });
        writeData(prompts);
        res.json({ success: true, categories: cats });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
