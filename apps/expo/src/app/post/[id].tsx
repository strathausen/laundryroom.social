import { SafeAreaView, Text, View } from "react-native";
import { Stack, useGlobalSearchParams } from "expo-router";

import { api } from "~/utils/api";

export default function Post() {
  const { id } = useGlobalSearchParams();
  if (!id || typeof id !== "string") throw new Error("unreachable");
  const { data } = api.group.byId.useQuery({ id });

  if (!data) return null;

  return (
    <SafeAreaView className="bg-background">
      <Stack.Screen options={{ title: data.group?.name }} />
      <View className="h-full w-full p-4">
        <Text className="py-2 text-3xl font-bold text-primary">
          {data.group?.name}
        </Text>
        <Text className="py-4 text-foreground">{data.group?.description}</Text>
      </View>
    </SafeAreaView>
  );
}
