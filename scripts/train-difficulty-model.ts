/**
 * TF.js LSTM Difficulty Model — Training Script
 *
 * Generates synthetic gameplay sessions and trains a small LSTM
 * that maps player metrics → difficulty multipliers.
 *
 * Run: npx tsx scripts/train-difficulty-model.ts
 * Output: public/models/difficulty/model.json + weights
 */
import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────
const NUM_SESSIONS = 2000;
const SEQUENCE_LENGTH = 10; // 10 timesteps per sequence (2s each = 20s window)
const INPUT_FEATURES = 8;
const OUTPUT_FEATURES = 4;
const EPOCHS = 50;
const BATCH_SIZE = 64;
const TARGET_TENSION = 0.65;
const MODEL_DIR = path.resolve(__dirname, '../public/models/difficulty');

// ── Feature indices ─────────────────────────────────────────────────
// Input: [grip%, stamina%, o2%, velocity, distToHazard, timeSinceDeath, deaths, inputFreq]
// Output: [gripMul, o2Mul, windMul, currentMul] — all 0..1

// ── Synthetic data generation ───────────────────────────────────────
function generateSession(): { inputs: number[][]; outputs: number[][] } {
    const inputs: number[][] = [];
    const outputs: number[][] = [];

    // Simulate a player with a random skill level
    const skill = Math.random(); // 0 = novice, 1 = expert

    let grip = 1.0;
    let stamina = 1.0;
    let velocity = 0;
    let deaths = 0;
    let timeSinceDeath = 30;
    let inputFreq = 2 + skill * 6; // 2-8 actions/sec

    for (let t = 0; t < SEQUENCE_LENGTH; t++) {
        // Simulate gameplay evolution
        const hazardDist = Math.random() * 10 + (1 - skill) * 5;
        const stress = 1 - (hazardDist / 15);

        // Player metrics evolve
        grip = Math.max(0, Math.min(1, grip - (0.05 + stress * 0.1) + skill * 0.08));
        stamina = Math.max(0, Math.min(1, stamina - 0.02 + skill * 0.03));
        velocity = 1 + skill * 2 + Math.random() * 0.5;
        timeSinceDeath = Math.min(60, timeSinceDeath + 2);
        inputFreq = Math.max(1, inputFreq + (Math.random() - 0.5) * 2);

        // Random death events (more likely for low-skill players)
        if (Math.random() < (1 - skill) * 0.15) {
            deaths++;
            timeSinceDeath = 0;
            grip = 1;
            stamina = 1;
        }

        const o2 = 1.0; // Not used in Level 1, but model expects it

        inputs.push([
            grip,
            stamina,
            o2,
            velocity / 3, // normalize to ~0-1
            hazardDist / 15, // normalize
            Math.min(timeSinceDeath / 60, 1),
            Math.min(deaths / 10, 1),
            inputFreq / 10,
        ]);

        // Compute current tension
        const gripTension = 1 - grip;
        const deathTension = deaths > 0 ? Math.min(deaths / 5, 1) * Math.max(0, 1 - timeSinceDeath / 30) : 0;
        const speedTension = velocity / 3;
        const currentTension = gripTension * 0.4 + deathTension * 0.3 + speedTension * 0.1 + stress * 0.2;

        // Target: adjust multipliers to push tension toward TARGET_TENSION
        const tensionDelta = currentTension - TARGET_TENSION;

        // If tension is too high, ease off (lower multipliers)
        // If tension is too low, ramp up (higher multipliers)
        const adjustment = -tensionDelta * 1.5; // negative delta → increase difficulty
        const baseMul = 0.5 + adjustment;
        const clamp = (v: number) => Math.max(0.1, Math.min(0.95, v));

        outputs.push([
            clamp(baseMul + (Math.random() - 0.5) * 0.1),     // gripMul
            clamp(baseMul + 0.05 + (Math.random() - 0.5) * 0.1), // o2Mul (slightly higher)
            clamp(baseMul - 0.05 + (Math.random() - 0.5) * 0.1), // windMul
            clamp(baseMul + (Math.random() - 0.5) * 0.1),     // currentMul
        ]);
    }

    return { inputs, outputs };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
    console.log('🧠 Training difficulty LSTM model...');
    console.log(`   Sessions: ${NUM_SESSIONS}`);
    console.log(`   Sequence length: ${SEQUENCE_LENGTH}`);
    console.log(`   Features: ${INPUT_FEATURES} → ${OUTPUT_FEATURES}`);

    // Generate training data
    const allInputs: number[][][] = [];
    const allOutputs: number[][][] = [];

    for (let i = 0; i < NUM_SESSIONS; i++) {
        const session = generateSession();
        allInputs.push(session.inputs);
        allOutputs.push(session.outputs);
    }

    // Convert to tensors — shape: [sessions, timesteps, features]
    const xTrain = tf.tensor3d(allInputs);
    const yTrain = tf.tensor3d(allOutputs);

    console.log(`   X shape: [${xTrain.shape}]`);
    console.log(`   Y shape: [${yTrain.shape}]`);

    // ── Build model ─────────────────────────────────────────────────
    const model = tf.sequential();

    model.add(tf.layers.lstm({
        units: 16,
        inputShape: [SEQUENCE_LENGTH, INPUT_FEATURES],
        returnSequences: true,
        kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }),
    }));

    model.add(tf.layers.dropout({ rate: 0.2 }));

    model.add(tf.layers.lstm({
        units: 12,
        returnSequences: true,
    }));

    model.add(tf.layers.timeDistributed({
        layer: tf.layers.dense({
            units: OUTPUT_FEATURES,
            activation: 'sigmoid', // outputs 0-1
        }),
    }));

    model.compile({
        optimizer: tf.train.adam(0.002),
        loss: 'meanSquaredError',
        metrics: ['mae'],
    });

    model.summary();

    // ── Train ───────────────────────────────────────────────────────
    console.log('\n📊 Training...');
    const history = await model.fit(xTrain, yTrain, {
        epochs: EPOCHS,
        batchSize: BATCH_SIZE,
        validationSplit: 0.15,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                if (epoch % 10 === 0 || epoch === EPOCHS - 1) {
                    console.log(
                        `   Epoch ${epoch + 1}/${EPOCHS} — loss: ${logs?.loss?.toFixed(5)}, ` +
                        `val_loss: ${logs?.val_loss?.toFixed(5)}, mae: ${logs?.mae?.toFixed(4)}`
                    );
                }
            },
        },
    });

    // ── Save model ──────────────────────────────────────────────────
    fs.mkdirSync(MODEL_DIR, { recursive: true });
    await model.save(`file://${MODEL_DIR}`);

    const finalLoss = history.history.loss[history.history.loss.length - 1];
    const paramCount = model.countParams();

    console.log(`\n✅ Model saved to ${MODEL_DIR}`);
    console.log(`   Parameters: ${paramCount}`);
    console.log(`   Final loss: ${(finalLoss as number).toFixed(5)}`);
    console.log(`   Model files: model.json + weights.bin`);

    // Cleanup
    xTrain.dispose();
    yTrain.dispose();
    model.dispose();
}

main().catch(console.error);
