/**
 * Generate a pre-trained difficulty model using pure TF.js (browser-compatible).
 * This creates a synthetic model with sensible weights — good enough for the PoC.
 * 
 * The actual model.json and weights can be exported from the browser console
 * or we use this simplified approach: a hand-tuned model that maps
 * player metrics → difficulty multipliers.
 * 
 * For the PoC, we use the heuristic-first, LSTM-second approach:
 * The AIDirector starts with the heuristic, and the LSTM model
 * is loaded asynchronously as an enhancement.
 */

import * as tf from '@tensorflow/tfjs';

const SEQUENCE_LENGTH = 10;
const INPUT_FEATURES = 8;
const OUTPUT_FEATURES = 4;

/**
 * Create and return a compiled LSTM model.
 * Can be used both for training and inference.
 */
export function createDifficultyModel(): tf.LayersModel {
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
        returnSequences: false, // only output last timestep for inference
    }));

    model.add(tf.layers.dense({
        units: OUTPUT_FEATURES,
        activation: 'sigmoid',
    }));

    model.compile({
        optimizer: tf.train.adam(0.002),
        loss: 'meanSquaredError',
    });

    return model;
}

/**
 * Generate synthetic training data.
 */
function generateTrainingData(numSessions: number) {
    const inputs: number[][][] = [];
    const outputs: number[][] = [];

    for (let s = 0; s < numSessions; s++) {
        const skill = Math.random();
        const sequence: number[][] = [];
        let grip = 1, stamina = 1, deaths = 0, timeSinceDeath = 30;
        let inputFreq = 2 + skill * 6;

        for (let t = 0; t < SEQUENCE_LENGTH; t++) {
            const hazardDist = Math.random() * 10 + (1 - skill) * 5;
            const stress = 1 - hazardDist / 15;

            grip = Math.max(0, Math.min(1, grip - (0.05 + stress * 0.1) + skill * 0.08));
            stamina = Math.max(0, Math.min(1, stamina - 0.02 + skill * 0.03));
            const velocity = 1 + skill * 2 + Math.random() * 0.5;
            timeSinceDeath = Math.min(60, timeSinceDeath + 2);
            inputFreq = Math.max(1, inputFreq + (Math.random() - 0.5) * 2);

            if (Math.random() < (1 - skill) * 0.15) {
                deaths++;
                timeSinceDeath = 0;
                grip = 1;
                stamina = 1;
            }

            sequence.push([
                grip, stamina, 1.0, velocity / 3,
                hazardDist / 15, Math.min(timeSinceDeath / 60, 1),
                Math.min(deaths / 10, 1), inputFreq / 10,
            ]);
        }

        inputs.push(sequence);

        // Compute target difficulty for last timestep
        const lastStep = sequence[sequence.length - 1];
        const gripTension = 1 - lastStep[0];
        const deathTension = lastStep[6] * Math.max(0, 1 - lastStep[5]);
        const currentTension = gripTension * 0.4 + deathTension * 0.3 + (1 - lastStep[4]) * 0.2 + lastStep[3] * 0.1;
        const TARGET = 0.65;
        const adjustment = -(currentTension - TARGET) * 1.5;
        const base = 0.5 + adjustment;
        const clamp = (v: number) => Math.max(0.1, Math.min(0.95, v));

        outputs.push([
            clamp(base + (Math.random() - 0.5) * 0.08),
            clamp(base + 0.05 + (Math.random() - 0.5) * 0.08),
            clamp(base - 0.05 + (Math.random() - 0.5) * 0.08),
            clamp(base + (Math.random() - 0.5) * 0.08),
        ]);
    }

    return {
        x: tf.tensor3d(inputs),
        y: tf.tensor2d(outputs),
    };
}

/**
 * Train the model in-browser. Returns the trained model.
 * This runs during the title screen / loading phase.
 */
export async function trainDifficultyModel(
    onProgress?: (epoch: number, loss: number) => void
): Promise<tf.LayersModel> {
    const model = createDifficultyModel();
    const { x, y } = generateTrainingData(500); // smaller set for in-browser training

    await model.fit(x, y, {
        epochs: 20,
        batchSize: 32,
        validationSplit: 0.15,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                onProgress?.(epoch, logs?.loss ?? 0);
            },
        },
    });

    x.dispose();
    y.dispose();

    return model;
}
