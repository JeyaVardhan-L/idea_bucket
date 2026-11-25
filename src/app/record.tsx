import { Redirect } from 'expo-router';
import { useState } from 'react';

/** Target of the app shortcut, the widget and ideabucket://record: open Capture and start recording. */
export default function RecordRoute() {
  const [stamp] = useState(() => String(Date.now()));
  return <Redirect href={{ pathname: '/', params: { autostart: stamp } }} />;
}
