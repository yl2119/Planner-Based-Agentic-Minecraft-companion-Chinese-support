import minecraftData from 'minecraft-data';
import settings from '../agent/settings.js';
import { createBot } from 'mineflayer';
import prismarine_items from 'prismarine-item';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as collectblock } from 'mineflayer-collectblock';
import { plugin as autoEat } from 'mineflayer-auto-eat';
import plugin from 'mineflayer-armor-manager';
const armorManager = plugin;
let mc_version = settings.minecraft_version;
let mcdata = null;
let Item = null;

/**
 * @typedef {string} ItemName
 * @typedef {string} BlockName
*/
const TOOL_TIERS = ['netherite', 'diamond', 'iron', 'gold', 'stone', 'wooden'];
export const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'];
export const MATCHING_WOOD_BLOCKS = [
    'log',
    'planks',
    'sign',
    'boat',
    'fence_gate',
    'door',
    'fence',
    'slab',
    'stairs',
    'button',
    'pressure_plate',
    'trapdoor'
]
export const WOOL_COLORS = [
    'white',
    'orange',
    'magenta',
    'light_blue',
    'yellow',
    'lime',
    'pink',
    'gray',
    'light_gray',
    'cyan',
    'purple',
    'blue',
    'brown',
    'green',
    'red',
    'black'
]


export function initBot(username) {
    const options = {
        username: username,
        host: settings.host,
        port: settings.port,
        auth: settings.auth,
        version: mc_version,
    }
    if (!mc_version || mc_version === "auto") {
        delete options.version;
    }

    const bot = createBot(options);
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectblock);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(armorManager); // auto equip armor
    bot.once('resourcePack', () => {
        bot.acceptResourcePack();
    });

    bot.once('login', () => {
        mc_version = bot.version;
        mcdata = minecraftData(mc_version);
        Item = prismarine_items(mc_version);
    });

    return bot;
}

export function isHuntable(mob) {
    if (!mob || !mob.name) return false;
    const animals = ['chicken', 'cow', 'llama', 'mooshroom', 'pig', 'rabbit', 'sheep'];
    return animals.includes(mob.name.toLowerCase()) && !mob.metadata[16]; // metadata 16 is not baby
}

export function isHostile(mob) {
    if (!mob || !mob.name) return false;
    return  (mob.type === 'mob' || mob.type === 'hostile') && mob.name !== 'iron_golem' && mob.name !== 'snow_golem';
}

// blocks that don't work with collectBlock, need to be manually collected
export function mustCollectManually(blockName) {
    // all crops (that aren't normal blocks), torches, buttons, levers, redstone,
    const full_names = ['wheat', 'carrots', 'potatoes', 'beetroots', 'nether_wart', 'cocoa', 'sugar_cane', 'kelp', 'short_grass', 'fern', 'tall_grass', 'bamboo',
        'poppy', 'dandelion', 'blue_orchid', 'allium', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'lilac', 'wither_rose', 'lily_of_the_valley', 'wither_rose',
        'lever', 'redstone_wire', 'lantern']
    const partial_names = ['sapling', 'torch', 'button', 'carpet', 'pressure_plate', 'mushroom', 'tulip', 'bush', 'vines', 'fern']
    return full_names.includes(blockName.toLowerCase()) || partial_names.some(partial => blockName.toLowerCase().includes(partial));
}

export function getItemId(itemName) {
    let item = mcdata.itemsByName[itemName];
    if (item) {
        return item.id;
    }
    return null;
}

export function getItemName(itemId) {
    let item = mcdata.items[itemId]
    if (item) {
        return item.name;
    }
    return null;
}

export function getBlockId(blockName) {
    let block = mcdata.blocksByName[blockName];
    if (block) {
        return block.id;
    }
    return null;
}

export function getBlockName(blockId) {
    let block = mcdata.blocks[blockId]
    if (block) {
        return block.name;
    }
    return null;
}

export function getEntityId(entityName) {
    let entity = mcdata.entitiesByName[entityName];
    if (entity) {
        return entity.id;
    }
    return null;
}

export function getAllItems(ignore) {
    if (!ignore) {
        ignore = [];
    }
    let items = []
    for (const itemId in mcdata.items) {
        const item = mcdata.items[itemId];
        if (!ignore.includes(item.name)) {
            items.push(item);
        }
    }
    return items;
}

export function getAllItemIds(ignore) {
    const items = getAllItems(ignore);
    let itemIds = [];
    for (const item of items) {
        itemIds.push(item.id);
    }
    return itemIds;
}

export function getAllBlocks(ignore) {
    if (!ignore) {
        ignore = [];
    }
    let blocks = []
    for (const blockId in mcdata.blocks) {
        const block = mcdata.blocks[blockId];
        if (!ignore.includes(block.name)) {
            blocks.push(block);
        }
    }
    return blocks;
}

export function getAllBlockIds(ignore) {
    const blocks = getAllBlocks(ignore);
    let blockIds = [];
    for (const block of blocks) {
        blockIds.push(block.id);
    }
    return blockIds;
}

export function getAllBiomes() {
    return mcdata.biomes;
}

export function getItemCraftingRecipes(itemName) {
    let itemId = getItemId(itemName);
    if (!mcdata.recipes[itemId]) {
        return null;
    }

    let recipes = [];
    for (let r of mcdata.recipes[itemId]) {
        let recipe = {};
        let ingredients = [];
        if (r.ingredients) {
            ingredients = r.ingredients;
        } else if (r.inShape) {
            ingredients = r.inShape.flat();
        }
        for (let ingredient of ingredients) {
            let ingredientName = getItemName(ingredient);
            if (ingredientName === null) continue;
            if (!recipe[ingredientName])
                recipe[ingredientName] = 0;
            recipe[ingredientName]++;
        }
        recipes.push([
            recipe,
            {craftedCount : r.result.count}
        ]);
    }
    // sort recipes by if their ingredients include common items
    const commonItems = ['oak_planks', 'oak_log', 'coal', 'cobblestone'];
    recipes.sort((a, b) => {
        let commonCountA = Object.keys(a[0]).filter(key => commonItems.includes(key)).reduce((acc, key) => acc + a[0][key], 0);
        let commonCountB = Object.keys(b[0]).filter(key => commonItems.includes(key)).reduce((acc, key) => acc + b[0][key], 0);
        return commonCountB - commonCountA;
    });

    return recipes;
}

export function isSmeltable(itemName) {
    const misc_smeltables = ['beef', 'chicken', 'cod', 'mutton', 'porkchop', 'rabbit', 'salmon', 'tropical_fish', 'potato', 'kelp', 'sand', 'cobblestone', 'clay_ball'];
    return itemName.includes('raw') || itemName.includes('log') || misc_smeltables.includes(itemName);
}

export function getSmeltingFuel(bot) {
    let fuel = bot.inventory.items().find(i => i.name === 'coal' || i.name === 'charcoal' || i.name === 'blaze_rod')
    if (fuel)
        return fuel;
    fuel = bot.inventory.items().find(i => i.name.includes('log') || i.name.includes('planks'))
    if (fuel)
        return fuel;
    return bot.inventory.items().find(i => i.name === 'coal_block' || i.name === 'lava_bucket');
}

export function getFuelSmeltOutput(fuelName) {
    if (fuelName === 'coal' || fuelName === 'charcoal')
        return 8;
    if (fuelName === 'blaze_rod')
        return 12;
    if (fuelName.includes('log') || fuelName.includes('planks'))
        return 1.5
    if (fuelName === 'coal_block')
        return 80;
    if (fuelName === 'lava_bucket')
        return 100;
    return 0;
}

export function getItemSmeltingIngredient(itemName) {
    return {    
        baked_potato: 'potato',
        steak: 'raw_beef',
        cooked_chicken: 'raw_chicken',
        cooked_cod: 'raw_cod',
        cooked_mutton: 'raw_mutton',
        cooked_porkchop: 'raw_porkchop',
        cooked_rabbit: 'raw_rabbit',
        cooked_salmon: 'raw_salmon',
        dried_kelp: 'kelp',
        iron_ingot: 'raw_iron',
        gold_ingot: 'raw_gold',
        copper_ingot: 'raw_copper',
        glass: 'sand'
    }[itemName];
}

export function getItemBlockSources(itemName) {
    let itemId = getItemId(itemName);
    let sources = [];
    for (let block of getAllBlocks()) {
        if (block.drops.includes(itemId)) {
            sources.push(block.name);
        }
    }
    return sources;
}

export function getItemAnimalSource(itemName) {
    return {    
        raw_beef: 'cow',
        raw_chicken: 'chicken',
        raw_cod: 'cod',
        raw_mutton: 'sheep',
        raw_porkchop: 'pig',
        raw_rabbit: 'rabbit',
        raw_salmon: 'salmon',
        leather: 'cow',
        wool: 'sheep'
    }[itemName];
}

export function getBlockTool(blockName) {
    let block = mcdata.blocksByName[blockName];
    if (!block || !block.harvestTools) {
        return null;
    }
    return getItemName(Object.keys(block.harvestTools)[0]);  // Double check first tool is always simplest
}

export function makeItem(name, amount=1) {
    return new Item(getItemId(name), amount);
}

/**
 * Returns the number of ingredients required to use the recipe once.
 * 
 * @param {Recipe} recipe
 * @returns {Object<mc.ItemName, number>} an object describing the number of each ingredient.
 */
export function ingredientsFromPrismarineRecipe(recipe) {
    let requiredIngedients = {};
    if (recipe.inShape)
        for (const ingredient of recipe.inShape.flat()) {
            if(ingredient.id<0) continue; //prismarine-recipe uses id -1 as an empty crafting slot
            const ingredientName = getItemName(ingredient.id);
            requiredIngedients[ingredientName] ??=0;
            requiredIngedients[ingredientName] += ingredient.count;
        }
    if (recipe.ingredients)
        for (const ingredient of recipe.ingredients) {
            if(ingredient.id<0) continue;
            const ingredientName = getItemName(ingredient.id);
            requiredIngedients[ingredientName] ??=0;
            requiredIngedients[ingredientName] -= ingredient.count;
            //Yes, the `-=` is intended.
            //prismarine-recipe uses positive numbers for the shaped ingredients but negative for unshaped.
            //Why this is the case is beyond my understanding.
        }
    return requiredIngedients;
}

/**
 * Calculates the number of times an action, such as a crafing recipe, can be completed before running out of resources.
 * @template T - doesn't have to be an item. This could be any resource.
 * @param {Object.<T, number>} availableItems - The resources available; e.g, `{'cobble_stone': 7, 'stick': 10}`
 * @param {Object.<T, number>} requiredItems - The resources required to complete the action once; e.g, `{'cobble_stone': 3, 'stick': 2}`
 * @param {boolean} discrete - Is the action discrete?
 * @returns {{num: number, limitingResource: (T | null)}} the number of times the action can be completed and the limmiting resource; e.g `{num: 2, limitingResource: 'cobble_stone'}`
 */
export function calculateLimitingResource(availableItems, requiredItems, discrete=true) {
    let limitingResource = null;
    let num = Infinity;
    for (const itemType in requiredItems) {
        if (availableItems[itemType] < requiredItems[itemType] * num) {
            limitingResource = itemType;
            num = availableItems[itemType] / requiredItems[itemType];
        }
    }
    if(discrete) num = Math.floor(num);
    return {num, limitingResource}
}

let loopingItems = new Set();

export function initializeLoopingItems() {

    loopingItems = new Set(['coal',
        'wheat',
        'bone_meal',
        'diamond',
        'emerald',
        'raw_iron',
        'raw_gold',
        'redstone',
        'blue_wool',
        'packed_mud',
        'raw_copper',
        'iron_ingot',
        'dried_kelp',
        'gold_ingot',
        'slime_ball',
        'black_wool',
        'quartz_slab',
        'copper_ingot',
        'lapis_lazuli',
        'honey_bottle',
        'rib_armor_trim_smithing_template',
        'eye_armor_trim_smithing_template',
        'vex_armor_trim_smithing_template',
        'dune_armor_trim_smithing_template',
        'host_armor_trim_smithing_template',
        'tide_armor_trim_smithing_template',
        'wild_armor_trim_smithing_template',
        'ward_armor_trim_smithing_template',
        'coast_armor_trim_smithing_template',
        'spire_armor_trim_smithing_template',
        'snout_armor_trim_smithing_template',
        'shaper_armor_trim_smithing_template',
        'netherite_upgrade_smithing_template',
        'raiser_armor_trim_smithing_template',
        'sentry_armor_trim_smithing_template',
        'silence_armor_trim_smithing_template',
        'wayfinder_armor_trim_smithing_template']);
}


/**
 * Gets a detailed plan for crafting an item considering current inventory
 */
export function getDetailedCraftingPlan(targetItem, count = 1, current_inventory = {}) {
    initializeLoopingItems();
    if (!targetItem || count <= 0 || !getItemId(targetItem)) {
        return "Invalid input. Please provide a valid item name and positive count.";
    }

    if (isBaseItem(targetItem)) {
        const available = current_inventory[targetItem] || 0;
        if (available >= count) return "You have all required items already in your inventory!";
        return `${targetItem} is a base item, you need to find ${count - available} more in the world`;
    }

    const inventory = { ...current_inventory };
    const leftovers = {};
    const plan = craftItem(targetItem, count, inventory, leftovers);
    return formatPlan(targetItem, plan);
}

function isBaseItem(item) {
    return loopingItems.has(item) || getItemCraftingRecipes(item) === null;
}

function craftItem(item, count, inventory, leftovers, crafted = { required: {}, steps: [], leftovers: {} }) {
    // Check available inventory and leftovers first
    const availableInv = inventory[item] || 0;
    const availableLeft = leftovers[item] || 0;
    const totalAvailable = availableInv + availableLeft;

    if (totalAvailable >= count) {
        // Use leftovers first, then inventory
        const useFromLeft = Math.min(availableLeft, count);
        leftovers[item] = availableLeft - useFromLeft;
        
        const remainingNeeded = count - useFromLeft;
        if (remainingNeeded > 0) {
            inventory[item] = availableInv - remainingNeeded;
        }
        return crafted;
    }

    // Use whatever is available
    const stillNeeded = count - totalAvailable;
    if (availableLeft > 0) leftovers[item] = 0;
    if (availableInv > 0) inventory[item] = 0;

    if (isBaseItem(item)) {
        crafted.required[item] = (crafted.required[item] || 0) + stillNeeded;
        return crafted;
    }

    const recipe = getItemCraftingRecipes(item)?.[0];
    if (!recipe) {
        crafted.required[item] = stillNeeded;
        return crafted;
    }

    const [ingredients, result] = recipe;
    const craftedPerRecipe = result.craftedCount;
    const batchCount = Math.ceil(stillNeeded / craftedPerRecipe);
    const totalProduced = batchCount * craftedPerRecipe;

    // Add excess to leftovers
    if (totalProduced > stillNeeded) {
        leftovers[item] = (leftovers[item] || 0) + (totalProduced - stillNeeded);
    }

    // Process each ingredient
    for (const [ingredientName, ingredientCount] of Object.entries(ingredients)) {
        const totalIngredientNeeded = ingredientCount * batchCount;
        craftItem(ingredientName, totalIngredientNeeded, inventory, leftovers, crafted);
    }

    // Add crafting step
    const stepIngredients = Object.entries(ingredients)
        .map(([name, amount]) => `${amount * batchCount} ${name}`)
        .join(' + ');
    crafted.steps.push(`Craft ${stepIngredients} -> ${totalProduced} ${item}`);

    return crafted;
}

function formatPlan(targetItem, { required, steps, leftovers }) {
    const lines = [];

    if (Object.keys(required).length > 0) {
        lines.push('You are missing the following items:');
        Object.entries(required).forEach(([item, count]) => 
            lines.push(`- ${count} ${item}`));
        lines.push('\nOnce you have these items, here\'s your crafting plan:');
    } else {
        lines.push('You have all items required to craft this item!');
        lines.push('Here\'s your crafting plan:');
    }

    lines.push('');
    lines.push(...steps);

    if (Object.keys(required).some(item => item.includes('oak')) && !targetItem.includes('oak')) {
        lines.push('Note: Any varient of wood can be used for this recipe.');
    }

    if (Object.keys(leftovers).length > 0) {
        lines.push('\nYou will have leftover:');
        Object.entries(leftovers).forEach(([item, count]) => 
            lines.push(`- ${count} ${item}`));
    }

    return lines.join('\n');
}

export function requireTool(blockName) {
    const block = mcdata.blocksByName[blockName];

    // State 3: Not a valid block at all (e.g., an item like 'stone_pickaxe')
    if (!block) {
        return undefined; 
    }

    if (block.harvestTools && Object.keys(block.harvestTools).length > 0) {
        const toolIds = Object.keys(block.harvestTools);
        const toolNames = toolIds.map(id => mcdata.items[id]?.name).filter(Boolean);
        
        // State 1: Requires a specific tool
        return toolNames[0] || null; 
    } else {
        // State 2: It IS a block, but doesn't have harvestTools (can be mined by hand)
        return null;
    }
}

// Helper to get tier index (lower is better/stronger)
function getTier(toolName) {
    if (!toolName) return Infinity;
    const material = toolName.split('_')[0];
    const index = TOOL_TIERS.indexOf(material);
    return index === -1 ? Infinity : index;
}

export async function createPlan(targetItem, count = 1, current_inventory = {}) {
    initializeLoopingItems();
    
    if (!targetItem || count <= 0 || !getItemId(targetItem)) {
        return JSON.stringify({ error: "Invalid input. Please provide a valid item name and positive count." });
    }

    let step_count = 1;
    let steps = [];
    let simulated_inventory = { ...current_inventory };
    const active_resolutions = new Set();

    function addStep(desc) {
        steps.push({
            step_id: `step_${step_count++}`,
            description: desc,
            status: "pending" 
        });
    }

    function resolveFuel(itemsToSmelt) {
        const fuels = ['coal', 'charcoal', 'oak_log'];
        let chosenFuel = 'coal'; 
        for (const f of fuels) {
            if (simulated_inventory[f] > 0) { chosenFuel = f; break; }
        }
        const itemsPerFuel = getFuelSmeltOutput(chosenFuel) || 1;
        const fuelNeeded = Math.ceil(itemsToSmelt / itemsPerFuel);
        resolveItem(chosenFuel, fuelNeeded);
        simulated_inventory[chosenFuel] -= fuelNeeded;
        return { name: chosenFuel, amount: fuelNeeded };
    }

    // Helper to find if we already have a suitable tool in inventory
    function getBestToolInInventory(requiredTool) {
        if (!requiredTool) return null;
        
        const toolType = requiredTool.split('_').slice(1).join('_'); // e.g., "pickaxe"
        const requiredTier = getTier(requiredTool);

        let bestTool = null;
        let bestTier = Infinity;

        // Check all items in simulated inventory
        for (const [itemName, count] of Object.entries(simulated_inventory)) {
            if (count > 0 && itemName.endsWith(toolType)) {
                const currentTier = getTier(itemName);
                // Must be at least as good as required (lower or equal index)
                if (currentTier <= requiredTier && currentTier < bestTier) {
                    bestTier = currentTier;
                    bestTool = itemName;
                }
            }
        }
        return bestTool;
    }

    function resolveItem(item, amountNeeded) {
        let available = simulated_inventory[item] || 0;
        if (available >= amountNeeded) return;
        if (active_resolutions.has(item)){
            return;

        } 
        active_resolutions.add(item);

        let needed = amountNeeded - available;

        // --- SPECIAL CASE: Redirect Planks to Logs ---
        if (item.endsWith('_planks')) {
            const woodType = item.split('_')[0]; 
            const logType = `${woodType}_log`;
            
            // 1 Log = 4 Planks
            const logsNeeded = Math.ceil(needed / 4);
            const planksYielded = logsNeeded * 4; // Calculate the actual yield
            
            resolveItem(logType, logsNeeded);

            // Consume the logs used
            simulated_inventory[logType] -= logsNeeded;
            
            // Output the actual yield
            addStep(`Craft ${planksYielded} ${item} from ${logsNeeded} ${logType}`);
            simulated_inventory[item] = (simulated_inventory[item] || 0) + planksYielded;
            
            active_resolutions.delete(item);
            return;
        }

        // --- ROUTE C: Animal Drops ---
        let animalSource = getItemAnimalSource(item);
        if (animalSource) {
            addStep(`Hunt ${animalSource} to collect ${needed} ${item}`);
            simulated_inventory[item] = (simulated_inventory[item] || 0) + needed;
            active_resolutions.delete(item);
            return;
        }

        // --- ROUTE B: Smelting ---
        let smeltIngredient = getItemSmeltingIngredient(item);
        if (smeltIngredient) {
            resolveItem(smeltIngredient, needed);
            const fuelUsed = resolveFuel(needed);
            addStep(`Smelt ${needed} ${smeltIngredient} using ${fuelUsed.amount} ${fuelUsed.name} into ${item}`);
            simulated_inventory[item] = (simulated_inventory[item] || 0) + needed;
            active_resolutions.delete(item);
            return;
        }

        // ==========================================
        // DETERMINISTIC FORK: Manufactured vs Natural
        // ==========================================
        const isNaturalResource = isBaseItem(item); 
        const recipes = getItemCraftingRecipes(item);

        // --- ROUTE A: CRAFTING (Prioritized for Manufactured Goods like Anvils) ---
        // If it's NOT a raw material, and it has a recipe, we MUST craft it.
        if (!isNaturalResource && recipes && recipes.length > 0) {
            let [recipe, result] = recipes[0];
            let yieldCount = result.craftedCount || 1;
            let batches = Math.ceil(needed / yieldCount);

            for (let [ingName, ingCount] of Object.entries(recipe)) {
                const totalIngNeeded = ingCount * batches;
                let skipItem = false;
                
                // CHECK IF INVENTORY HAS ENOUGH OF THE ITEM
                for (const [itemName, count] of Object.entries(simulated_inventory)) {
                    if (itemName === ingName && count >= totalIngNeeded){
                        skipItem = true;
                        break;
                    }
                }
                
                // SKIP RESOLVING ITEM IF INVENTORY ALREADY HAS THE ITEM
                if(!skipItem){
                    resolveItem(ingName, totalIngNeeded);
                    // --- CRITICAL FIX: Consume the ingredients ---
                    simulated_inventory[ingName] -= totalIngNeeded;
                }
            }

            addStep(`Craft ${batches * yieldCount} ${item}`);
            simulated_inventory[item] = (simulated_inventory[item] || 0) + (batches * yieldCount);
            active_resolutions.delete(item);
            return;
        }

        // --- ROUTE D: MINING / COLLECTING (Prioritized for Natural Resources) ---
        let blockSources = getItemBlockSources(item);
        if (isNaturalResource || blockSources.length > 0 || mcdata.blocksByName[item]) {
            let targetBlock = blockSources.length > 0 ? blockSources[0] : item;
            let requiredTool = requireTool(targetBlock);

            if (requiredTool !== undefined) {
                let description = "";
                const woodNote = targetBlock.endsWith('_log') ? " (Note: Any type of wood can be used)" : "";

                if (requiredTool !== null) {
                    // CHECK: Do we already have a tool that works?
                    let toolToUse = getBestToolInInventory(requiredTool);

                    if (!toolToUse) {
                        // We don't have one, so we must resolve the required one
                        resolveItem(requiredTool, 1);
                        toolToUse = requiredTool; 
                    }
                    description = `Mine ${targetBlock} using ${toolToUse} to collect ${needed} ${item}${woodNote}`;
                } else {
                    description = `Collect ${targetBlock} by hand to get ${needed} ${item}${woodNote}`;
                }
                
                addStep(description);
                simulated_inventory[item] = (simulated_inventory[item] || 0) + needed;
                active_resolutions.delete(item);
                return;
            }
        }

        // --- FINAL FALLBACK ---
        // Catches uncraftable, unmineable items like Saddles, Name Tags, or mob loot.
        addStep(`Obtain ${needed} ${item} (Check chests or mob drops)`);
        simulated_inventory[item] = (simulated_inventory[item] || 0) + needed;
        
        active_resolutions.delete(item);
    }
    resolveItem(targetItem, count);
    if (steps.length > 0) {
        steps[0].status = "in_progress";
    }

    return JSON.stringify({ steps: steps }, null, 2);
}