#!/usr/bin/env node
// Synthetic data generator for SafeSphere
// Outputs NDJSON (one JSON object per line) to stdout or file

const fs = require('fs');

const sceneTypes = ['workshop','lab','factory','warehouse','office','outdoor','unknown'];
const intents = [
  'immediate_action','clarify_context','equipment_status','chemical_safety','ppe_review','visibility_issue','housekeeping','scene_hint','incident_report','general_observation'
];

function randomChoice(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

function randomNote(scene, intent) {
  const adjectives = ['critical','minor','severe','observed','suspected','visible','intermittent','persistent'];
  const actions = ['leak','exposed wire','unsecured guard','missing PPE','slippery floor','overloaded shelf','blocked exit','damaged tool'];
  const equipment = ['conveyor','motor','pump','lathe','grinder','forklift','panel','compressor'];

  const template = [];
  if (intent === 'immediate_action') template.push(`Urgent: ${randomChoice(actions)} near the ${randomChoice(equipment)}.`);
  else if (intent === 'clarify_context') template.push(`Please verify the condition of the ${randomChoice(equipment)} at station 3.`);
  else if (intent === 'equipment_status') template.push(`Observed abnormal noise from ${randomChoice(equipment)}; vibration apparent.`);
  else if (intent === 'chemical_safety') template.push(`Detected unknown container labeled "chemical" with potential fumes.`);
  else if (intent === 'ppe_review') template.push(`Workers missing gloves and goggles near ${randomChoice(equipment)}.`);
  else if (intent === 'visibility_issue') template.push(`Lighting insufficient in aisle 4; visibility reduced.`);
  else if (intent === 'housekeeping') template.push(`Debris and clutter around workspace; trip hazard.`);
  else if (intent === 'scene_hint') template.push(`Routine check in ${scene} area shows signs of wear.`);
  else if (intent === 'incident_report') template.push(`Reported injury: operator slipped; minor laceration.`);
  else template.push(`General observation: ${randomChoice(adjectives)} condition near ${randomChoice(equipment)}.`);

  // add noise and variability
  if (Math.random() > 0.8) template.push(`See attached photo.`);
  if (Math.random() > 0.85) template.push(`Occurred at ${new Date().toISOString()}.`);

  return template.join(' ');
}

function generate(count, outPath) {
  const stream = outPath ? fs.createWriteStream(outPath, { flags: 'w' }) : process.stdout;
  let produced = 0;
  for (let i=0;i<count;i++) {
    const scene = randomChoice(sceneTypes);
    const intent = randomChoice(intents);
    const note = randomNote(scene, intent);
    const sample = {
      id: `synth-${Date.now()}-${i}`,
      timestamp: new Date().toISOString(),
      scene,
      intent,
      note
    };
    stream.write(JSON.stringify(sample)+"\n");
    produced++;
    // avoid blocking too long in large runs
    if (produced % 10000 === 0 && outPath) stream.emit('drain');
  }
  if (outPath) stream.end();
  return produced;
}

if (require.main === module) {
  const count = parseInt(process.argv[2],10) || 1000;
  const out = process.argv[3] || null;
  const produced = generate(count, out);
  console.error(`Generated ${produced} synthetic samples`);
}
