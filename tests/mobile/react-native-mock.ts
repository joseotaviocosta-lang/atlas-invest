export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
};

export const Platform = {
  OS: 'ios',
  select: <T>(objs: { ios?: T; default?: T }): T | undefined => objs.ios ?? objs.default,
};

export const View = () => null;
export const Text = () => null;
export const TextInput = () => null;
export const TouchableOpacity = () => null;
export const ActivityIndicator = () => null;
export const FlatList = () => null;
export const RefreshControl = () => null;
export const StatusBar = () => null;

export default {
  StyleSheet,
  Platform,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
};
