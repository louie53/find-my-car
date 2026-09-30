import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { ParkingController, type DeviceServices } from '../controller/ParkingController';
import { ParkingRepository, type CameraResult, type PhotoStore } from '../data/ParkingRepository';
import { isLocation, isPhotoName, mapsURLs } from '../domain/parking';

const directory = () => new Directory(Paths.document, 'parking-photos');
function photoFile(filename: string): File {
  if (!isPhotoName(filename)) throw new Error('The saved photo reference is invalid.');
  return new File(directory(), filename);
}

const photos: PhotoStore = {
  async copyFromCamera(uri, filename) {
    if (!uri.startsWith('file://') && !uri.startsWith('content://')) {
      throw new Error('The camera did not return a local photo.');
    }
    directory().create({ intermediates: true, idempotent: true });
    const destination = photoFile(filename);
    if (destination.exists) throw new Error('The new photo file already exists. Please retake it.');
    const temporary = new File(directory(), filename + '.copying');
    try {
      if (temporary.exists) temporary.delete();
      await new File(uri).copy(temporary, { overwrite: false });
      if (!temporary.exists || temporary.size <= 0) throw new Error('Empty camera copy.');
      // Android 10+ uses a same-directory rename, without move()'s copy/delete fallback.
      temporary.rename(filename);
    } catch {
      try { if (temporary.exists) temporary.delete(); } catch { /* Retain an unreferenced temporary file if cleanup fails. */ }
      throw new Error('Your photo could not be copied. Your previous photo is unchanged.');
    }
  },
  async exists(filename) {
    const file = photoFile(filename);
    return file.exists && file.size > 0;
  },
  async remove(filename) {
    const file = photoFile(filename);
    if (file.exists) file.delete();
    const temporary = new File(directory(), filename + '.copying');
    if (temporary.exists) temporary.delete();
  },
  uri: (filename) => photoFile(filename).uri,
};

function cameraResult(result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult): CameraResult {
  if ('code' in result) return { kind: 'error', message: 'The camera could not finish. Your previous photo and text have been kept.' };
  if (result.canceled) return { kind: 'cancelled' };
  const asset = result.assets[0];
  if (!asset?.uri) return { kind: 'error', message: 'The camera did not return a photo. Try taking it again.' };
  return { kind: 'photo', uri: asset.uri };
}

export const nativeDevices: DeviceServices = {
  async locate() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('Location permission was not granted. Add a clue, or enable location in App settings.');
    if (!await Location.hasServicesEnabledAsync()) throw new Error('Location is switched off. You can still save your parking clues.');
    let position: Location.LocationObject;
    try {
      position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false });
    } catch {
      throw new Error('Location is unavailable here. You can still save clues or try again.');
    }
    const location = {
      latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString(),
    };
    if (!isLocation(location)) throw new Error('A valid location could not be obtained. Save your clues or try again.');
    return location;
  },
  async requestCameraPermission() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    return permission.granted;
  },
  async takePhoto() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'], allowsEditing: false, quality: 0.8, exif: false,
      base64: false,
    });
    return cameraResult(result);
  },
  async pendingPhoto() {
    if (Platform.OS !== 'android') return null;
    const result = await ImagePicker.getPendingResultAsync();
    return result ? cameraResult(result) : null;
  },
  async openMaps(location) {
    const [geo, web] = mapsURLs(location);
    try { await Linking.openURL(geo); }
    catch {
      try { await Linking.openURL(web); }
      catch { throw new Error('Maps could not be opened. Your saved parking clues are still available.'); }
    }
  },
  async openSettings() {
    try { await Linking.openSettings(); }
    catch { throw new Error('App settings could not be opened. You can still save manual clues.'); }
  },
};

export const repository = new ParkingRepository(AsyncStorage, photos, () => Crypto.randomUUID(), () => new Date().toISOString());
export const controller = new ParkingController(repository, nativeDevices);
