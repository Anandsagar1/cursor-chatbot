// API Key management
const API_KEY_STORAGE = 'gemini_api_key';

// Get saved API key from localStorage
let apiKey = localStorage.getItem(API_KEY_STORAGE);

// DOM elements
const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

// Initialize
if (apiKey) {
    apiKeyInput.value = apiKey;
    clearWelcomeMessage();
}

// Event listeners
saveKeyBtn.addEventListener('click', saveApiKey);
apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        saveApiKey();
    }
});

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize textarea
userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
});

async function listAvailableModels() {
    if (!apiKey) return null;
    
    // Try both v1 and v1beta
    for (const version of ['v1beta', 'v1']) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`);
            if (response.ok) {
                const data = await response.json();
                if (data.models && data.models.length > 0) {
                    return data.models;
                }
            }
        } catch (error) {
            // Try next version
            continue;
        }
    }
    return null;
}

function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        apiKey = key;
        localStorage.setItem(API_KEY_STORAGE, key);
        apiKeyInput.type = 'password';
        clearWelcomeMessage();
        showMessage('API key saved successfully!', 'bot');
        // Optionally list available models
        listAvailableModels().then(models => {
            if (models && models.length > 0) {
                const modelNames = models
                    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                    .map(m => m.name.replace('models/', ''))
                    .slice(0, 5);
                if (modelNames.length > 0) {
                    console.log('Available models:', modelNames);
                }
            }
        });
    }
}

function clearWelcomeMessage() {
    const welcome = chatContainer.querySelector('.welcome-message');
    if (welcome) {
        welcome.remove();
    }
}

function showMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return messageDiv;
}

function showError(errorText) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = `Error: ${errorText}`;
    chatContainer.appendChild(errorDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    
    if (!apiKey) {
        showError('Please enter your Gemini API key first!');
        return;
    }
    
    // Disable input and show user message
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = true;
    
    showMessage(message, 'user');
    
    // Show loading indicator
    const loadingDiv = showMessage('Thinking...', 'bot');
    const loadingIndicator = document.createElement('span');
    loadingIndicator.className = 'loading';
    loadingDiv.querySelector('.message-content').appendChild(loadingIndicator);
    
    // Try different model/version combinations (newer models first)
    const modelConfigs = [
        { version: 'v1beta', model: 'gemini-2.0-flash-exp' },
        { version: 'v1beta', model: 'gemini-1.5-pro' },
        { version: 'v1beta', model: 'gemini-1.5-flash' },
        { version: 'v1beta', model: 'gemini-pro' },
        { version: 'v1', model: 'gemini-1.5-pro' },
        { version: 'v1', model: 'gemini-1.5-flash' },
        { version: 'v1', model: 'gemini-pro' }
    ];
    
    let lastError = null;
    
    for (const config of modelConfigs) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/${config.version}/models/${config.model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: message
                        }]
                    }]
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                lastError = new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
                continue; // Try next model
            }
            
            const data = await response.json();
            
            // Remove loading message
            loadingDiv.remove();
            
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const botResponse = data.candidates[0].content.parts[0].text;
                showMessage(botResponse, 'bot');
                sendBtn.disabled = false;
                userInput.focus();
                return; // Success!
            } else {
                lastError = new Error('Unexpected response format from API');
                continue;
            }
            
        } catch (error) {
            lastError = error;
            continue; // Try next model
        }
    }
    
    // If we get here, all models failed - try to get available models
    loadingDiv.remove();
    
    // Try to list available models for better error message
    const availableModels = await listAvailableModels();
    let errorMsg = lastError ? lastError.message : 'Failed to connect to Gemini API.';
    
    if (availableModels && availableModels.length > 0) {
        const supportedModels = availableModels
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => m.name.replace('models/', ''));
        if (supportedModels.length > 0) {
            errorMsg += ` Available models: ${supportedModels.slice(0, 3).join(', ')}.`;
            // Try the first available model with both API versions
            const firstModel = supportedModels[0];
            for (const version of ['v1beta', 'v1']) {
                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/${version}/models/${firstModel}:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: message }] }]
                        })
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                            const botResponse = data.candidates[0].content.parts[0].text;
                            showMessage(botResponse, 'bot');
                            sendBtn.disabled = false;
                            userInput.focus();
                            return;
                        }
                    }
                } catch (e) {
                    // Try next version
                    continue;
                }
            }
        }
    }
    
    showError(errorMsg + ' Please check your API key and ensure the Generative Language API is enabled.');
    sendBtn.disabled = false;
    userInput.focus();
}

