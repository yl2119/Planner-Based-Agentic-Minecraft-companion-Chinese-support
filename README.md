# Games 4 MC Companion

## Cloning code

1) Make a fork on this repository
2) Clone your fork to your computer

## Pushing code

1) Push the code back to your own fork
2) Create a merge request (then I'll look through the changes and approve)

## Change Model to gpt-4o-mini

1) Open:janet.js
- Find the model configuration and change it to: "model": "gpt-4o-mini"
- Locate the embedding configuration. It should be set to: "embedding": "openai"

If you cannot find the embedding configuration:
Check behind the "saving_memory" logic
Someone may have accidentally moved it there
Or search the project for:
embedding


2) Add Your OpenAI API Key, go to the file: keys.example.json

Create a new file : keys.json
Paste the copied content inside
Replace: "openaiApiKey": "YOUR_API_KEY_HERE"
e.g. "openaiApiKey": "sk-xxxxxxxxxxxxxxxx"


3) remember to Ctrl+s before node main.js
4) Important
    - After creating keys.json, delete or remove keysExample.json
    - Never commit keys.json to Git
    - Make sure keys.json is in .gitignore



## Installation
Mindcraft files:  
1) run "npm install" in the root directory

Local LLM:
1) Install ollama
2) Run the following command to install the mindcraft LLM model:
```
ollama pull sweaterdog/andy-4:micro-q8_0 && ollama pull embeddinggemma
```

## Running
1) Launch ollama
2) Open Minecraft Launcher and launch Version 1.21.1
3) Go to single player and open a single player world
4) Once you are in the world, press "esc" and select "open to LAN"
5) Enter port number 55916
6) In the root directory run `node main.js`
7) If there are no errors in the terminal Janet should join your game