/**
 * Minimal ambient declaration for the native CSPRNG polyfill installed by
 * react-native-get-random-values (a side-effect import with no shipped
 * types). This project's tsconfig excludes the DOM lib on purpose, so
 * `crypto.getRandomValues` isn't declared anywhere else.
 */
interface Crypto {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}
declare const crypto: Crypto;
