import { FlexWidget, TextWidget } from 'react-native-android-widget';

export function RecordWidget() {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'ideabucket://record' }}
      accessibilityLabel="Record a thought"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#17181C',
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <FlexWidget
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}
      >
        <TextWidget text="●" style={{ fontSize: 20, color: '#FFFFFF' }} />
      </FlexWidget>
      <TextWidget text="Record thought" style={{ fontSize: 16, color: '#EDEEF0', fontWeight: '600' }} />
    </FlexWidget>
  );
}
