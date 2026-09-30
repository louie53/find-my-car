import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { controller } from './src/native/services';
import { ParkingApp } from './src/ui/ParkingApp';

export default function App() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <StatusBar style="dark" />
    <ParkingApp controller={controller} />
  </SafeAreaProvider>;
}
