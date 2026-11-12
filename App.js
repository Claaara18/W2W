import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts, JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { WardrobeProvider } from './context/WardrobeContext';
import { CollectionProvider } from './context/CollectionContext';
import { CalendarProvider }   from './context/CalendarContext';

import HomeScreen from './screens/HomeScreen';
import MatchScreen from './screens/MatchScreen';
import CollectionScreen from './screens/CollectionScreen';
import ClosetScreen from './screens/ClosetScreen';
import CalendarScreen from './screens/CalendarScreen';

const Tab = createBottomTabNavigator();

const BROWN = '#5C4A2A';
const BEIGE = '#F5EFE6';
const INACTIVE = '#BBA98A';

export default function App() {
  const [fontsLoaded] = useFonts({ JetBrainsMono_400Regular, JetBrainsMono_500Medium });
  if (!fontsLoaded) return null;

  return (
    <WardrobeProvider>
    <CollectionProvider>
    <CalendarProvider>
    <SafeAreaProvider>
      <NavigationContainer>
      <Tab.Navigator
        initialRouteName="HOME"
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: BEIGE,
            borderTopColor: '#E0D5C5',
            borderTopWidth: 1,
            height: 72,
            paddingBottom: 10,
            paddingTop: 8,
            paddingHorizontal: 12,
          },
          tabBarActiveTintColor: BROWN,
          tabBarInactiveTintColor: INACTIVE,
          tabBarLabelStyle: {
            fontSize: 7,
            fontWeight: '600',
            letterSpacing: 1,
            marginTop: 2,
          },
        }}
      >
        <Tab.Screen
          name="COLLECTION"
          component={CollectionScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="heart" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="MATCH"
          component={MatchScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="diamond-stone" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="HOME"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
            tabBarLabelStyle: {
              fontSize: 7,
              fontWeight: '600',
              letterSpacing: 0,
              marginTop: 2,
            },
          }}
        />
        <Tab.Screen
          name="CLOSET"
          component={ClosetScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="hanger" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="CALENDAR"
          component={CalendarScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar" size={size} color={color} />
            ),
            tabBarLabelStyle: {
              fontSize: 7,
              fontWeight: '600',
              letterSpacing: 0,
              marginTop: 2,
            },
          }}
        />
      </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
    </CalendarProvider>
    </CollectionProvider>
    </WardrobeProvider>
  );
}
