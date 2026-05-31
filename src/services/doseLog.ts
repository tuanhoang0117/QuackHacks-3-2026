import AsyncStorage from '@react-native-async-storage/async-storage';
import { DoseLogEntry } from '../types';

const KEY = 'medscrosslink_dose_log';

export async function getDoses(): Promise<DoseLogEntry[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DoseLogEntry[];
  } catch {
    return [];
  }
}

export async function saveDose(entry: DoseLogEntry): Promise<void> {
  const existing = await getDoses();
  existing.unshift(entry);
  await AsyncStorage.setItem(KEY, JSON.stringify(existing));
}

export async function clearDoses(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
