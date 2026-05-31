import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import HomeScreen from '../screens/HomeScreen';
import DocumentScreen from '../screens/DocumentScreen';
import ScanScreen from '../screens/ScanScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const Tab = createBottomTabNavigator();

function tabIcon(route: string, focused: boolean): IconName {
  switch (route) {
    case 'Home':      return focused ? 'home'                : 'home-outline';
    case 'Documents': return focused ? 'document-text'      : 'document-text-outline';
    case 'Scan':      return focused ? 'scan-circle'        : 'scan-circle-outline';
    case 'History':   return focused ? 'time'               : 'time-outline';
    case 'Profile':   return focused ? 'person'             : 'person-outline';
    default:          return 'help-circle-outline';
  }
}

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={tabIcon(route.name, focused)} size={size} color={color} />
        ),
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
          elevation: 10,
          shadowOpacity: 0.08,
        },
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'MedsCrossLink' }}
      />
      <Tab.Screen
        name="Documents"
        component={DocumentScreen}
        options={{ title: 'Documents' }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{ title: 'Scan', tabBarLabelStyle: { fontWeight: '700' } }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'History' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}
