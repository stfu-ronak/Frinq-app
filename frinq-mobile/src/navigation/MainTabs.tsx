import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { color } from '../design/tokens/colors';
import { VibeReportScreen } from '../features/vibe-report/screens/VibeReportScreen';
import { CommunityPlaceholderScreen } from '../features/community/screens/CommunityPlaceholderScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';
import { EditProfileScreen } from '../features/profile/screens/EditProfileScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { CommunitySettingsScreen } from '../features/settings/screens/CommunitySettingsScreen';
import { PrivacySettingsScreen } from '../features/settings/screens/PrivacySettingsScreen';
import { AccountScreen } from '../features/settings/screens/AccountScreen';
import { DeleteAccountScreen } from '../features/settings/screens/DeleteAccountScreen';
import { LegalDocumentScreen, LegalDocKey } from '../features/legal/screens/LegalDocumentScreen';
import { LegalHubScreen } from '../features/legal/screens/LegalHubScreen';
import { SupportScreen } from '../features/legal/screens/SupportScreen';

export type MainTabParamList = {
  Community: undefined;
  Profile: undefined;
  Settings: undefined;
};

/** Profile stack — the Vibe card + full report are reachable from Profile
 *  (Task 34), not a tab of their own. */
export type ProfileStackParamList = {
  ProfileHome: undefined;
  EditProfile: undefined;
  VibeReport: undefined;
};

/** Settings stack. `Account` is a small landing page before the destructive
 *  `DeleteAccount` flow — never one accidental tap from the main list.
 *  `Legal` is the hub (acceptance state + view-in-app/read-online); it and
 *  `Support` both still route into `LegalDocument` for the actual content,
 *  reusing the same screen the pre-auth legal gate uses. */
export type SettingsStackParamList = {
  SettingsHome: undefined;
  CommunitySettings: undefined;
  PrivacySettings: undefined;
  Legal: undefined;
  LegalDocument: { doc: LegalDocKey };
  Support: undefined;
  Account: undefined;
  DeleteAccount: undefined;
};

const Tabs = createBottomTabNavigator<MainTabParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="VibeReport" component={VibeReportScreen} />
    </ProfileStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
      <SettingsStack.Screen name="CommunitySettings" component={CommunitySettingsScreen} />
      <SettingsStack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
      <SettingsStack.Screen name="Legal" component={LegalHubScreen} />
      <SettingsStack.Screen name="LegalDocument" component={LegalDocumentScreen} />
      <SettingsStack.Screen name="Support" component={SupportScreen} />
      <SettingsStack.Screen name="Account" component={AccountScreen} />
      <SettingsStack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
    </SettingsStack.Navigator>
  );
}

/** Three bottom tabs: Community, Profile, Settings. */
export function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.state.selected,
        tabBarInactiveTintColor: color.text.secondary,
      }}
    >
      <Tabs.Screen name="Community" component={CommunityPlaceholderScreen} />
      <Tabs.Screen name="Profile" component={ProfileNavigator} />
      <Tabs.Screen name="Settings" component={SettingsNavigator} />
    </Tabs.Navigator>
  );
}
