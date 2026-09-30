import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, Image, Keyboard, KeyboardAvoidingView,
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type ParkingController, type ViewState } from '../controller/ParkingController';
import { findingSteps, type Draft, type ParkingRecord } from '../domain/parking';

const c = { background: '#fbfcfa', ink: '#202a25', muted: '#627168', green: '#2f694f', finish: '#11804b',
  panel: '#eef1ec', record: '#eef3ec', border: '#c7d0c8', pale: '#e7efe2', error: '#7c482c' };

type ButtonProps = { label: string; onPress: () => void; disabled?: boolean;
  kind?: 'primary' | 'secondary' | 'link' | 'completion' | 'subtle'; icon?: 'check' | 'plus' | undefined };
function Button({ label, onPress, disabled = false, kind = 'primary', icon }: ButtonProps) {
  const filled = kind === 'primary' || kind === 'completion';
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, kind === 'primary' ? styles.primary : kind === 'completion' ? styles.completion
      : kind === 'secondary' ? styles.secondary : styles.link,
      pressed && !disabled && (kind === 'completion' ? styles.completionPressed : styles.pressed), disabled && styles.disabled]}>
    {icon ? <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.buttonIcon, filled ? styles.primaryText : kind === 'subtle' ? styles.subtleText : styles.linkText]}>{icon === 'check' ? '✓' : '+'}</Text> : null}
    <Text style={[styles.buttonText, filled ? styles.primaryText : styles.linkText, kind === 'subtle' && styles.subtleText]}>{label}</Text>
  </Pressable>;
}

function Feedback({ view }: { view: ViewState }) {
  return <>
    {view.error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{view.error}</Text> : null}
    {view.notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{view.notice}</Text> : null}
    {view.warnings.map((warning, index) => <Text key={index} accessibilityRole="alert" style={styles.error}>{warning}</Text>)}
  </>;
}

function Photo({ uri, enlarge }: { uri: string; enlarge: () => void }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <Text accessibilityRole="alert" style={styles.error}>This photo is unavailable. Your saved parking clues have been kept. Retake or remove the photo when editing.</Text>
    : <Pressable accessibilityRole="button" accessibilityLabel="Enlarge parking photo" onPress={enlarge} style={styles.photo}>
      <Image source={{ uri }} accessibilityLabel="Your parking photo" style={styles.image} resizeMode="cover"
        onError={() => setFailed(true)} />
      <Text style={styles.photoCaption}>Tap to enlarge</Text>
    </Pressable>;
}

function LocationPanel({ view, controller }: { view: ViewState; controller: ParkingController }) {
  const location = view.draft?.location;
  const preserved = view.draft?.mode === 'edit';
  const unavailable = view.locationStatus === 'unavailable';
  const title = preserved ? location ? 'Saved parking location' : 'No location saved'
    : view.locationStatus === 'loading' ? 'Getting location'
    : location ? unavailable ? 'Previous location kept' : 'Location captured'
    : unavailable ? 'Location unavailable' : 'Location not captured';
  const copy = preserved ? 'Editing keeps your original parking position.'
    : view.locationStatus === 'loading' ? view.locationMessage
    : location && unavailable ? 'The last location in this draft is kept. ' + view.locationMessage
    : location ? 'Tap Save parking to keep this approximate position.'
    : view.locationMessage || 'You can save parking clues without GPS.';
  const requestLabel = unavailable ? 'Try again' : location ? 'Update location' : 'Get location';
  return <View style={styles.location}>
    <View style={styles.locationIcon}>{view.locationStatus === 'loading'
      ? <ActivityIndicator color={c.green} /> : <Text style={styles.approx}>≈</Text>}</View>
    <View style={styles.flex}>
      <Text style={styles.locationTitle}>{title}</Text>
      <Text style={styles.small}>{copy}</Text>
      {location?.accuracy != null ? <Text style={styles.small}>Reported accuracy: about {Math.round(location.accuracy)} m. This does not identify a level.</Text> : null}
      {!preserved && view.locationStatus !== 'loading' ? <View style={styles.inlineActions}>
        <Button kind="link" label={requestLabel} disabled={view.busy} onPress={() => { void controller.requestLocation(); }} />
        {view.locationStatus === 'unavailable' ? <Button kind="link" label="App settings" disabled={view.busy} onPress={() => { void controller.openSettings(); }} /> : null}
      </View> : null}
    </View>
  </View>;
}

type FormProps = { draft: Draft; view: ViewState; controller: ParkingController; enlarge: (uri: string) => void; cancel: () => void };
function Form({ draft, view, controller, enlarge, cancel }: FormProps) {
  const [noteOpen, setNoteOpen] = useState(Boolean(draft.landmark));
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 350 || fontScale > 1.3;
  const isEdit = draft.mode === 'edit';
  const photoUri = draft.photo ? controller.repo.photos.uri(draft.photo) : null;

  function save() {
    Keyboard.dismiss();
    const replacement = !isEdit ? view.state?.active : null;
    if (replacement) {
      Alert.alert('Replace saved parking?', 'Your current parking record will be replaced only after the new one saves successfully.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Replace', onPress: () => { void controller.save(replacement.id); } },
      ], { cancelable: true });
    } else void controller.save();
  }

  return <>
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={[styles.title, styles.flex]}>{isEdit ? 'Edit parking' : 'Save parking'}</Text>
      <Button kind="link" label="Cancel" disabled={view.busy} onPress={cancel} />
    </View>
    <Text style={styles.intro}>Save a few clues to find your car later.</Text>
    <Feedback view={view} />
    <View style={styles.section}><LocationPanel view={view} controller={controller} /></View>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.h2}>Where did you park?</Text>
      <View style={[styles.fields, stacked && styles.stacked]}>
        <View style={stacked ? styles.fullWidth : styles.flex}>
          <Text nativeID="levelLabel" style={styles.label}>Level</Text>
          <TextInput accessibilityLabel="Level" accessibilityLabelledBy="levelLabel" style={styles.input}
            value={draft.level} onChangeText={(v) => controller.setField('level', v)}
            placeholder="e.g. 3" placeholderTextColor="#7b877f" editable={!view.busy}
            maxLength={60} autoCorrect={false} returnKeyType="done" />
        </View>
        <View style={stacked ? styles.fullWidth : styles.flex}>
          <Text nativeID="zoneLabel" style={styles.label}>Zone / bay</Text>
          <TextInput accessibilityLabel="Zone or bay" accessibilityLabelledBy="zoneLabel" style={styles.input}
            value={draft.zone} onChangeText={(v) => controller.setField('zone', v)}
            placeholder="e.g. B27" placeholderTextColor="#7b877f" editable={!view.busy}
            maxLength={100} autoCorrect={false} autoCapitalize="characters" returnKeyType="done" />
        </View>
      </View>
    </View>
    {photoUri ? <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.h2}>Parking photo</Text>
      <View style={styles.photoSpacing}><Photo key={photoUri} uri={photoUri} enlarge={() => enlarge(photoUri)} /></View>
      <View style={styles.inlineActions}>
        <Button kind="link" label="Retake photo" disabled={view.busy} onPress={() => { void controller.capture(); }} />
        <Button kind="link" label="Remove photo" disabled={view.busy} onPress={() => controller.removePhoto()} />
      </View>
    </View> : <Pressable accessibilityRole="button" accessibilityLabel="Add a parking photo, optional"
      accessibilityState={{ disabled: view.busy }} disabled={view.busy}
      onPress={() => { Keyboard.dismiss(); void controller.capture(); }}
      style={({ pressed }) => [styles.addPhoto, pressed && styles.pressed, view.busy && styles.disabled]}>
      <View style={styles.photoHeading}><Text style={styles.plus}>+</Text><Text style={[styles.h2, styles.flex]}>Add a photo</Text><Text style={styles.small}>Optional</Text></View>
      <Text style={styles.photoCopy}>Capture a pillar, level sign or nearby lift.</Text>
    </Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel="Add a landmark note, optional"
      accessibilityState={{ expanded: noteOpen, disabled: view.busy }} disabled={view.busy}
      onPress={() => setNoteOpen(!noteOpen)} style={styles.noteToggle}>
      <Text style={[styles.label, styles.flex]}>Add a landmark note</Text>
      <Text style={styles.small}>Optional</Text><Text style={styles.chevron}>{noteOpen ? '⌄' : '›'}</Text>
    </Pressable>
    {noteOpen ? <TextInput accessibilityLabel="Landmark note" style={[styles.input, styles.noteInput]}
      value={draft.landmark} onChangeText={(v) => controller.setField('landmark', v)}
      placeholder="e.g. Near Lift C" placeholderTextColor="#7b877f" multiline maxLength={500}
      editable={!view.busy} textAlignVertical="top" /> : null}
    {view.error?.includes('Camera permission') ? <Button kind="link" label="Open App settings" disabled={view.busy} onPress={() => { void controller.openSettings(); }} /> : null}
    <View style={styles.footer}>
      {view.busy ? <View style={styles.working}><ActivityIndicator color={c.green} /><Text style={styles.small}>Keeping your parking clues safe…</Text></View> : null}
      <Button label={view.busy ? 'Please wait…' : isEdit ? 'Save changes' : 'Save parking'} disabled={view.busy} onPress={save} />
      <Text style={styles.footerCopy}>You can save clues without GPS.</Text>
    </View>
  </>;
}

function RecordView({ record, view, controller, enlarge }: { record: ParkingRecord; view: ViewState; controller: ParkingController; enlarge: (uri: string) => void }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 350 || fontScale > 1.3;
  const photoUri = record.photo ? controller.repo.photos.uri(record.photo) : null;
  const steps = findingSteps(record);
  return <>
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={[styles.title, styles.flex]}>Your parked car</Text>
      <Button kind="link" label="Edit" disabled={view.busy} onPress={() => controller.begin('edit')} />
    </View>
    <Text style={styles.savedTime}>Saved {new Date(record.savedAt).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
    <Feedback view={view} />
    <View style={styles.recordCard}>
      <View style={[styles.recordGrid, stacked && styles.stacked]}>
        <View style={stacked ? styles.fullWidth : styles.flex}><Text style={styles.recordLabel}>Level</Text>
          <Text style={[styles.recordValue, (!record.level || record.level.length > 6) && styles.smallValue]}>{record.level || 'Not added'}</Text></View>
        <View style={[stacked ? styles.fullWidth : styles.flex, !stacked && styles.recordDivider]}><Text style={styles.recordLabel}>Zone / bay</Text>
          <Text style={[styles.recordValue, (!record.zone || record.zone.length > 6) && styles.smallValue]}>{record.zone || 'Not added'}</Text></View>
      </View>
      {record.landmark ? <Text style={styles.landmark}>{record.landmark}</Text> : null}
    </View>
    {photoUri ? <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.h2}>Parking photo</Text>
      <View style={styles.photoSpacing}><Photo key={photoUri} uri={photoUri} enlarge={() => enlarge(photoUri)} /></View>
    </View> : null}
    {record.location ? <View style={styles.mapsRow}>
      <View><Text style={styles.muted}>Approximate location</Text><Text style={styles.small}>
        {record.location.accuracy != null ? 'About ' + Math.round(record.location.accuracy) + ' m accuracy. ' : ''}Use your clues indoors.</Text></View>
      <Button kind="secondary" label="Open in Maps ↗" disabled={view.busy} onPress={() => { void controller.openMaps(); }} />
    </View> : <Text style={[styles.small, styles.section]}>No GPS location saved. Use your parking clues below.</Text>}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: helpOpen }} onPress={() => setHelpOpen(!helpOpen)} style={styles.helpToggle}>
      <Text style={[styles.helpLabel, styles.flex]}>Need help finding it?</Text><Text style={styles.chevron}>{helpOpen ? '⌄' : '›'}</Text>
    </Pressable>
    {helpOpen ? <View style={styles.steps}>
      {steps.map((step, index) => <View style={styles.step} key={index}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
        <View style={styles.flex}><Text style={styles.stepTitle}>{step.title}</Text><Text style={styles.small}>{step.copy}</Text></View>
      </View>)}
      <Text style={styles.small}>GPS cannot identify a level or provide a route inside a car park.</Text>
    </View> : null}
    <View style={styles.footer}>
      <Button kind="completion" icon={view.busy ? undefined : 'check'} label={view.busy ? 'Please wait…' : 'Found my car'}
        disabled={view.busy} onPress={() => { void controller.found(); }} />
      <Text style={styles.footerCopy}>Ends this parking record. You can undo it.</Text>
      <View style={styles.newParkingArea}><Button kind="subtle" icon="plus" label="New parking"
        disabled={view.busy} onPress={() => controller.begin('new')} /></View>
    </View>
  </>;
}

function Empty({ view, controller }: { view: ViewState; controller: ParkingController }) {
  return <>
    <Feedback view={view} />
    {view.state?.undo ? <View style={styles.undo}>
      <Text style={[styles.muted, styles.flex]}>Your previous parking record can be restored.</Text>
      <Button kind="link" label="Undo" disabled={view.busy} onPress={() => { void controller.undo(); }} />
    </View> : null}
    <View style={styles.emptySymbol}><Text style={styles.approx}>P</Text></View>
    <Text accessibilityRole="header" style={styles.emptyTitle}>No parking saved</Text>
    <Text style={styles.emptyCopy}>Save a few clues when you park, then come back here to find your car.</Text>
    <View style={styles.section}><Text accessibilityRole="header" style={styles.h2}>Forgot to save?</Text>
      <Text style={styles.muted}>Think of your entry point, the level signs and any nearby lifts. This app only knows the clues you saved.</Text></View>
    <View style={styles.footer}><Button label="Add parking" icon="plus" disabled={view.busy} onPress={() => controller.begin('new')} />
      <Text style={styles.footerCopy}>Your parking clues stay on this phone.</Text></View>
  </>;
}

export function ParkingApp({ controller }: { controller: ParkingController }) {
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const enlarge = (uri: string) => { setPhotoFailed(false); setEnlarged(uri); };
  useEffect(() => { void controller.boot(); }, [controller]);

  const cancel = () => {
    if (view.busy) return;
    Keyboard.dismiss();
    Alert.alert('Discard these changes?', 'Your previously saved parking record will be kept.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', onPress: () => { void controller.cancel(); } },
    ], { cancelable: true });
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (enlarged) { setEnlarged(null); return true; }
      if (view.busy) return true;
      if (view.draft) {
        Alert.alert('Discard these changes?', 'Your previously saved parking record will be kept.', [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', onPress: () => { void controller.cancel(); } },
        ], { cancelable: true });
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [controller, enlarged, view.busy, view.draft]);

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
        <Text style={styles.brand}>FIND MY CAR</Text>
        {view.phase === 'loading' ? <View style={styles.loading}><ActivityIndicator color={c.green} size="large" /><Text style={styles.muted}>Reading your parking clues…</Text></View>
          : view.phase === 'blocked' ? <>
            <Text accessibilityRole="header" style={styles.title}>Your parking is protected</Text>
            <Feedback view={view} />
            <Text style={styles.muted}>We will not replace saved data or remove photos while it cannot be read safely.</Text>
            <Button kind="secondary" label="Retry loading" onPress={() => { void controller.boot(); }} />
          </> : view.draft ? <Form key={view.draft.id} draft={view.draft} view={view} controller={controller} enlarge={enlarge} cancel={cancel} />
            : view.state?.active ? <RecordView key={view.state.active.id} record={view.state.active} view={view} controller={controller} enlarge={enlarge} />
              : <Empty view={view} controller={controller} />}
      </ScrollView>
    </KeyboardAvoidingView>
    <Modal visible={Boolean(enlarged)} animationType="fade" onRequestClose={() => setEnlarged(null)}>
      <SafeAreaView style={styles.modal}><Button kind="secondary" label="Close photo" onPress={() => setEnlarged(null)} />
        {photoFailed ? <Text accessibilityRole="alert" style={styles.error}>This photo could not be displayed. Your saved parking record is unchanged.</Text>
          : enlarged ? <Image style={styles.fullPhoto} source={{ uri: enlarged }} resizeMode="contain" accessibilityLabel="Enlarged parking photo" onError={() => setPhotoFailed(true)} /> : null}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  flex: { flex: 1 },
  fullWidth: { width: '100%' },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 25, paddingBottom: 20, maxWidth: 650, width: '100%', alignSelf: 'center' },
  brand: { color: c.muted, fontSize: 11, lineHeight: 16, letterSpacing: 1.6, fontWeight: '600', marginBottom: 13 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '600', letterSpacing: -1, color: c.ink },
  intro: { marginTop: 8, fontSize: 16, lineHeight: 24, color: c.muted },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: c.ink },
  section: { marginTop: 25 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, backgroundColor: c.panel, padding: 16, minHeight: 86 },
  locationIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e1e7df', alignItems: 'center', justifyContent: 'center' },
  approx: { color: '#56655c', fontSize: 24, fontWeight: '600' },
  locationTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: c.ink },
  small: { fontSize: 12, lineHeight: 18, color: c.muted, marginTop: 3 },
  muted: { fontSize: 14, lineHeight: 22, color: c.muted },
  fields: { flexDirection: 'row', gap: 14, marginTop: 14 },
  stacked: { flexDirection: 'column' },
  label: { fontSize: 14, lineHeight: 20, color: c.ink },
  input: { minHeight: 56, marginTop: 8, borderWidth: 1, borderColor: c.border, borderRadius: 10, backgroundColor: '#fff', color: c.ink, paddingHorizontal: 14, paddingVertical: 14, fontSize: 18 },
  noteInput: { minHeight: 90, fontSize: 16 },
  addPhoto: { marginTop: 24, padding: 19, minHeight: 116, borderWidth: 1, borderStyle: 'dashed', borderColor: '#b6c3b8', borderRadius: 14, backgroundColor: '#fff' },
  photoHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  plus: { color: '#347354', fontSize: 23 },
  photoCopy: { marginTop: 10, color: c.muted, fontSize: 14, lineHeight: 21 },
  noteToggle: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 8, marginTop: 12 },
  chevron: { color: c.muted, fontSize: 23 },
  footer: { marginTop: 'auto', paddingTop: 24 },
  footerCopy: { marginTop: 12, color: c.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  button: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', gap: 10,
    justifyContent: 'center', alignItems: 'center', borderRadius: 11 },
  primary: { minHeight: 56, backgroundColor: c.green, borderRadius: 14 },
  completion: { minHeight: 54, paddingHorizontal: 22, paddingVertical: 14, backgroundColor: c.finish, borderRadius: 999,
    shadowColor: '#164f2f', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.14, shadowRadius: 7, elevation: 3 },
  completionPressed: { backgroundColor: '#0c693d', transform: [{ translateY: 1 }],
    shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, elevation: 1 },
  secondary: { borderWidth: 1.5, borderColor: c.green, backgroundColor: c.background, marginTop: 12 },
  link: { minHeight: 44, paddingHorizontal: 4, backgroundColor: 'transparent' },
  buttonText: { fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  buttonIcon: { fontSize: 22, lineHeight: 26 },
  primaryText: { color: '#fff' },
  linkText: { color: c.green, fontSize: 14, lineHeight: 22 },
  subtleText: { color: c.muted, fontWeight: '500' },
  newParkingArea: { marginTop: 18, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#e1e7e0' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  error: { padding: 12, backgroundColor: '#f7eee6', color: c.error, fontSize: 13, lineHeight: 20, borderRadius: 8, marginTop: 12 },
  notice: { color: '#2f5740', backgroundColor: c.pale, padding: 12, fontSize: 14, lineHeight: 20, borderRadius: 12, marginTop: 16 },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  photoSpacing: { marginTop: 11 },
  photo: { borderRadius: 14, overflow: 'hidden', backgroundColor: c.panel },
  image: { width: '100%', height: 185 },
  photoCaption: { padding: 8, textAlign: 'center', color: c.muted, fontSize: 12 },
  savedTime: { color: c.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  recordCard: { marginTop: 20, padding: 20, borderWidth: 1, borderColor: '#dbe4da', backgroundColor: c.record, borderRadius: 16 },
  recordGrid: { flexDirection: 'row', gap: 18 },
  recordLabel: { fontSize: 13, lineHeight: 20, color: '#596d5d' },
  recordValue: { marginTop: 4, fontSize: 46, lineHeight: 54, fontWeight: '600', letterSpacing: -1.5, color: c.ink },
  smallValue: { fontSize: 22, lineHeight: 30, letterSpacing: 0, paddingTop: 8 },
  recordDivider: { paddingLeft: 18, borderLeftWidth: 1, borderLeftColor: '#d1ddce' },
  landmark: { marginTop: 17, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#d6e0d3', color: '#4a6250', fontSize: 15, lineHeight: 22 },
  mapsRow: { marginTop: 14, gap: 6 },
  helpToggle: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#e0e5dc', flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 8 },
  helpLabel: { color: c.green, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  steps: { gap: 19, paddingTop: 6, paddingBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e7eee3', justifyContent: 'center', alignItems: 'center' },
  stepNumberText: { color: '#3e6146', fontSize: 13, fontWeight: '600' },
  stepTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: c.ink },
  emptySymbol: { width: 66, height: 66, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.record, marginTop: 48, marginBottom: 25, alignSelf: 'center' },
  emptyTitle: { textAlign: 'center', fontSize: 27, lineHeight: 34, fontWeight: '600', color: c.ink },
  emptyCopy: { textAlign: 'center', color: c.muted, fontSize: 15, lineHeight: 23, marginTop: 12 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.pale, padding: 12, borderRadius: 12, marginTop: 16 },
  working: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  modal: { flex: 1, backgroundColor: c.background, padding: 20 },
  fullPhoto: { flex: 1, width: '100%', marginTop: 12 },
});
