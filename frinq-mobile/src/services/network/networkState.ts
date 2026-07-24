import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

/** Feed NetInfo reachability into TanStack Query's onlineManager so queries/
 *  mutations pause while offline and resume on reconnect. Returns an
 *  unsubscribe. Call once at app start. */
export function bindNetworkToQuery(): () => void {
  // onlineManager owns the NetInfo subscription's cleanup (it invokes the
  // returned unsubscribe when the listener is replaced). setEventListener
  // itself returns void, so there's no top-level unbind to forward.
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }),
  );
  return () => {};
}

/** UI hook driving the global offline banner. */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return () => unsub();
  }, []);
  return offline;
}
