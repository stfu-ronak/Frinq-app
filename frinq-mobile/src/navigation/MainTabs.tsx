import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { color } from '../design/tokens/colors';
import { VibeReportScreen } from '../features/vibe-report/screens/VibeReportScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';
import { EditProfileScreen } from '../features/profile/screens/EditProfileScreen';
import { SettingsScreen } from '../features/settings/screens/SettingsScreen';
import { CommunitySettingsScreen } from '../features/settings/screens/CommunitySettingsScreen';
import { NotificationSettingsScreen } from '../features/settings/screens/NotificationSettingsScreen';
import { PrivacySettingsScreen } from '../features/settings/screens/PrivacySettingsScreen';
import { AccountScreen } from '../features/settings/screens/AccountScreen';
import { DeleteAccountScreen } from '../features/settings/screens/DeleteAccountScreen';
import { LegalDocumentScreen, LegalDocKey } from '../features/legal/screens/LegalDocumentScreen';
import { LegalHubScreen } from '../features/legal/screens/LegalHubScreen';
import { SupportScreen } from '../features/legal/screens/SupportScreen';

export type MainTabParamList = {
  // Community and Events keep their route types — the screens still exist and
  // are one line away from returning to the bar.
  Community: undefined;
  Events: undefined;
  Profile: undefined;
};

/** Profile stack — the Vibe card/report, Edit Profile, and the whole Settings
 *  list all live here now (2026-07-27 design spec: Settings moved from its
 *  own 3rd bottom tab to a gear icon on Profile — one stack, not two). */
export type ProfileStackParamList = {
  ProfileHome: undefined;
  EditProfile: undefined;
  VibeReport: undefined;
  SettingsHome: undefined;
  CommunitySettings: undefined;
  Notifications: undefined;
  PrivacySettings: undefined;
  Legal: undefined;
  LegalDocument: { doc: LegalDocKey };
  Support: undefined;
  Account: undefined;
  DeleteAccount: undefined;
};

const Tabs = createBottomTabNavigator<MainTabParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="VibeReport" component={VibeReportScreen} />
      <ProfileStack.Screen name="SettingsHome" component={SettingsScreen} />
      <ProfileStack.Screen name="CommunitySettings" component={CommunitySettingsScreen} />
      <ProfileStack.Screen name="Notifications" component={NotificationSettingsScreen} />
      <ProfileStack.Screen name="PrivacySettings" component={PrivacySettingsScreen} />
      <ProfileStack.Screen name="Legal" component={LegalHubScreen} />
      <ProfileStack.Screen name="LegalDocument" component={LegalDocumentScreen} />
      <ProfileStack.Screen name="Support" component={SupportScreen} />
      <ProfileStack.Screen name="Account" component={AccountScreen} />
      <ProfileStack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
    </ProfileStack.Navigator>
  );
}

/** Profile only, for now. Community was already hidden pending AI Matchmaker;
 *  Events is now hidden too — it has no real content to show yet, and an empty
 *  "no events yet" tab is worse than no tab. Both screens and their routes stay
 *  fully intact, just unmounted from the tab bar, so restoring either is a
 *  one-line change here.
 *
 *  With a single tab the bar itself is hidden: a one-item tab bar is dead
 *  chrome that costs vertical space and tells the reader nothing. */
export function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        tabBarActiveTintColor: color.state.selected,
        tabBarInactiveTintColor: color.text.secondary,
      }}
    >
      <Tabs.Screen name="Profile" component={ProfileNavigator} />
    </Tabs.Navigator>
  );
}
