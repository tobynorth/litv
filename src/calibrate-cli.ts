import { runFullCalibration } from './calibrate';

runFullCalibration().then(() => {
  console.log('\n🎯 Calibration complete!');
  process.exit(0);
}).catch((error) => {
  console.error('Calibration failed:', error);
  process.exit(1);
});
