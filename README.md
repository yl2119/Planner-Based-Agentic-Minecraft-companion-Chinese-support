# Games 4 MC Companion

## Cloning code

1) Make a fork on this repository
2) Clone your fork to your computer

## Pushing code

1) Push the code back to your own fork
2) Create a merge request (then I'll look through the changes and approve)

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