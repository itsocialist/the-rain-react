const pptxgen = require("pptxgenjs");
const fs = require('fs');
const path = require('path');

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = 'Brian Dawson';
pres.title = 'The Rain Continues - Concept v2';

const colorDark = "1A1C20";      // Deep concrete grey
const colorText = "EFEFEF";      // Off-white
const colorAccent = "D95C3C";    // Rust orange
const colorSecondary = "4D6454"; // Algae green

pres.defineSlideMaster({
    title: 'MASTER_DARK',
    background: { color: colorDark },
    objects: [
        { rect: { x: 0, y: 0, w: '100%', h: 0.15, fill: { color: colorAccent } } }
    ]
});

// Helper for slide titles
function addTitle(slide, text) {
    slide.addText(text, {
        x: 0.5, y: 0.4, w: 9, h: 0.8,
        fontSize: 36, color: colorText, bold: true, align: "left"
    });
}

// ----------------------------------------------------
// 1. Title Slide
// ----------------------------------------------------
const titleSlide = pres.addSlide({ masterName: "MASTER_DARK" });
titleSlide.addText("THE RAIN CONTINUES", {
    x: 0.5, y: 1.5, w: 9, h: 1.5,
    fontSize: 54, color: colorText, bold: true, align: "center", fontFace: "Impact"
});
titleSlide.addText("Game Concept Overview v2.0 (Neo-Pluvial Update)", {
    x: 0.5, y: 2.8, w: 9, h: 0.8,
    fontSize: 24, color: colorAccent, bold: true, align: "center"
});
titleSlide.addText("GENRE: Survival Exploration\nPLATFORM: PC / Console\nPLAYERS: Single Player", {
    x: 0.5, y: 3.8, w: 9, h: 1.2,
    fontSize: 18, color: "A0A0A0", align: "center", breakLine: true
});

// ----------------------------------------------------
// 2. The Concept
// ----------------------------------------------------
const conceptSlide = pres.addSlide({ masterName: "MASTER_DARK" });
addTitle(conceptSlide, "The Concept");

conceptSlide.addText([
    { text: "Fifteen years ago, the rain started and never stopped.", options: { breakLine: true, bold: true } },
    { text: "A shift in ocean-atmosphere coupling restructured the global cycle.", options: { breakLine: true } },
    { text: "Everything below the 30th floor belongs to the water now.", options: { breakLine: true } },
    { text: "A systemic survival exploration game across a drowned city.", options: { breakLine: true, bullet: true } },
    { text: "Above: Traverse a decaying skyline of improvised bridges.", options: { breakLine: true, bullet: true } },
    { text: "Below: Dive into lightless interiors for critical salvage.", options: { bullet: true } }
], {
    x: 0.5, y: 1.5, w: 4.5, h: 3.5,
    fontSize: 18, color: colorText, margin: 0.1, paraSpaceAfter: 10
});

conceptSlide.addImage({
    path: "/Users/briandawson/workspace/the-rain-react/reference_assets/pluvial-central-valley.png",
    x: 5.2, y: 1.3, w: 4.5, h: 3.8, sizing: { type: "cover" }
});

// ----------------------------------------------------
// 3. Tone & Aesthetic
// ----------------------------------------------------
const toneSlide = pres.addSlide({ masterName: "MASTER_DARK" });
addTitle(toneSlide, "Tone & Aesthetic");

toneSlide.addText([
    { text: "Not post-apocalyptic. Post-adaptation.", options: { bold: true, color: colorAccent, breakLine: true } },
    { text: "People survive, build, argue, and adapt. Tension comes from holding the fragile together.", options: { breakLine: true } },
    { text: "Visual Palette: Concrete grey, rust orange, algae green.", options: { bullet: true, breakLine: true } },
    { text: "Audio Landscape: Rain is the inescapable baseline.", options: { bullet: true, breakLine: true } },
    { text: "No Guns: Conflict is environmental, structural, and social.", options: { bullet: true } }
], {
    x: 0.5, y: 1.5, w: 4.5, h: 3.5,
    fontSize: 18, color: colorText, margin: 0.1, paraSpaceAfter: 10
});

toneSlide.addImage({
    path: "/Users/briandawson/workspace/the-rain-react/reference_assets/Gemini_Generated_Image_yssihpyssihpyssi.jpeg",
    x: 5.2, y: 1.3, w: 4.5, h: 3.8, sizing: { type: "cover" }
});

// ----------------------------------------------------
// 4. Core Pillars: Traversal & Physiology
// ----------------------------------------------------
const mechanicsSlide = pres.addSlide({ masterName: "MASTER_DARK" });
addTitle(mechanicsSlide, "Core Pillars: Traversal & Physiology");

mechanicsSlide.addText([
    { text: "Dual-State Traversal", options: { bold: true, color: colorAccent, breakLine: true } },
    { text: "Navigate between climbing, walking (3 m/s), and swimming (2 m/s).", options: { breakLine: true } },
    { text: "Deep Physiological Systems", options: { bold: true, color: colorAccent, breakLine: true, margin: { top: 20 } } },
    { text: "Respiration: Manage air pockets and degrading rebreathers.", options: { bullet: true, breakLine: true } },
    { text: "Thermal: Wetness amplifies cold, leading to deadly tremors.", options: { bullet: true, breakLine: true } },
    { text: "Contamination: Toxic water builds bioaccumulation.", options: { bullet: true } }
], {
    x: 0.5, y: 1.5, w: 4.5, h: 3.5,
    fontSize: 18, color: colorText, margin: 0.1, paraSpaceAfter: 10
});

mechanicsSlide.addImage({
    path: "/Users/briandawson/workspace/the-rain-react/reference_assets/visual_target_grip.png",
    x: 5.2, y: 1.3, w: 4.5, h: 3.8, sizing: { type: "cover" }
});

// ----------------------------------------------------
// 5. Weather as Antagonist
// ----------------------------------------------------
const weatherSlide = pres.addSlide({ masterName: "MASTER_DARK" });
addTitle(weatherSlide, "Weather as the Ultimate Antagonist");

weatherSlide.addText([
    { text: "Weather isn't a skybox; it’s an active, cyclical threat.", options: { breakLine: true, bold: true } },
    { text: "Storm Surges:", options: { bold: true, color: colorSecondary, breakLine: true } },
    { text: "Raise the waterline by meters, submerging safe walkways.", options: { bullet: true, breakLine: true } },
    { text: "Lightning:", options: { bold: true, color: colorSecondary, breakLine: true } },
    { text: "Strikes metal structures making sky-bridges lethal.", options: { bullet: true, breakLine: true } },
    { text: "Fog Banks:", options: { bold: true, color: colorSecondary, breakLine: true } },
    { text: "Zero visibility post-storm, impacting navigation.", options: { bullet: true } }
], {
    x: 0.5, y: 1.5, w: 4.5, h: 3.5,
    fontSize: 18, color: colorText, margin: 0.1, paraSpaceAfter: 10
});

weatherSlide.addImage({
    path: "/Users/briandawson/workspace/the-rain-react/reference_assets/visual_target_bridge.png",
    x: 5.2, y: 1.3, w: 4.5, h: 3.8, sizing: { type: "cover" }
});

// ----------------------------------------------------
// 6. The Drowned City: Biomes
// ----------------------------------------------------
const biomeSlide = pres.addSlide({ masterName: "MASTER_DARK" });
addTitle(biomeSlide, "The Drowned City: Biomes");

biomeSlide.addText([
    { text: "Infrastructure Decay: Bridges collapse permanently over time.", options: { bullet: true, breakLine: true } },
    { text: "1. Rooftop Canopy: Vine-covered safe traversal.", options: { bullet: true, breakLine: true } },
    { text: "2. Mid-Rise Tidal: Rusted office floors, fluctuating tide.", options: { bullet: true, breakLine: true } },
    { text: "3. Street-Level Marsh: Murky channels, ambush points.", options: { bullet: true, breakLine: true } },
    { text: "4. Submerged Commercial: Dead dark, bioluminescence.", options: { bullet: true, breakLine: true } },
    { text: "5. Deep Infrastructure: The abyss, extreme pressure.", options: { bullet: true, breakLine: true } }
], {
    x: 0.5, y: 1.5, w: 4.5, h: 3.5,
    fontSize: 18, color: colorText, margin: 0.1, paraSpaceAfter: 10
});

biomeSlide.addImage({
    path: "/Users/briandawson/workspace/the-rain-react/reference_assets/pluvial-street review.png",
    x: 5.2, y: 1.3, w: 4.5, h: 3.8, sizing: { type: "cover" }
});

// ----------------------------------------------------
// 7. Scavenging & Narrative
// ----------------------------------------------------
const narrativeSlide = pres.addSlide({ masterName: "MASTER_DARK" });
addTitle(narrativeSlide, "Scavenging & Narrative");

narrativeSlide.addText([
    { text: "Everything degrades. The world is hostile to preservation.", options: { bold: true, breakLine: true } },
    { text: "Communities rely on the player's salvage and trade.", options: { breakLine: true } },
    { text: "The Runner:", options: { color: colorAccent, bold: true, breakLine: true } },
    { text: "Skyline missions balancing socio-political survival.", options: { bullet: true, breakLine: true } },
    { text: "The Diver:", options: { color: colorAccent, bold: true, breakLine: true } },
    { text: "Pushing into the alien abyss.", options: { bullet: true, breakLine: true } },
    { text: "The Journal:", options: { color: colorAccent, bold: true, breakLine: true } },
    { text: "Decrypting 'Project Deluge' from early flood years.", options: { bullet: true } }
], {
    x: 0.5, y: 1.5, w: 4.5, h: 3.5,
    fontSize: 18, color: colorText, margin: 0.1, paraSpaceAfter: 10
});

narrativeSlide.addImage({
    path: "/Users/briandawson/workspace/the-rain-react/reference_assets/puliva-2.png",
    x: 5.2, y: 1.3, w: 4.5, h: 3.8, sizing: { type: "cover" }
});

// ----------------------------------------------------
// Save file
// ----------------------------------------------------
pres.writeFile({ fileName: "/Users/briandawson/workspace/the-rain-react/reference_assets/THE_RAIN_CONTINUES_Concept_v2.pptx" }).then(fileName => {
    console.log(`created presentation: ${fileName}`);
}).catch(err => {
    console.log(err);
});
