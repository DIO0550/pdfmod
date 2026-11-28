/**
 * PDF の標準セキュリティハンドラ用の同期プリミティブ。
 *
 * Web Crypto は MD5・RC4・ECB とパディングなしの CBC を揃えられない。
 * TypeScript に揃えると Node とブラウザで同じ同期 API を使え、環境別の実装や依存パッケージをバンドルする必要がない。
 */
export { Aes } from "./aes/index";
export { Md5 } from "./md5/index";
export { Rc4 } from "./rc4/index";
export { Sha256 } from "./sha2/sha256/index";
export { Sha384, Sha512 } from "./sha2/sha512/index";
