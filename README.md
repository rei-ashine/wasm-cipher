# [WASM-Cipher](https://rei-ashine.github.io/wasm-cipher/)

DATE: 2026-07-07

![EncryptionTool](./PNG/EncryptionTool.png)

## Security Update
This application has been migrated from AES-CBC to the **AES-GCM** (Galois/Counter Mode) authenticated encryption algorithm for enhanced security.
- Data integrity checks are now performed automatically upon decryption, preventing tampering.
- Employs modern WebAssembly (`wasm-pack`) + Rust cryptographic libraries (`aes-gcm`, `pbkdf2`).

## Diagram

![Diagram](./PNG/Diagram_EncryptionTool.png)

## Directory Structure
```
.
├── .github
│   ├── dependabot.yml
│   └── workflows
│       └── static.yml
├── .gitignore
├── Cargo.lock
├── Cargo.toml
├── PNG
│   ├── Diagram_EncryptionTool.png
│   └── EncryptionTool.png
├── README.md
├── src
│   ├── cipher.rs
│   └── lib.rs
└── www
    ├── .gitignore
    ├── bootstrap.js
    ├── index.html
    ├── index.js
    ├── package-lock.json
    ├── package.json
    ├── public
    │   ├── assets
    │   ├── css
    │   └── html
    ├── README.md
    └── webpack.config.js
```
---
```
===============================================================================
 Language                     files          blank        comment           code
===============================================================================
 JSON                             2              0              0           3727
 HTML                             3             37             23            257
 JavaScript                       4             34              7            196
 CSS                              1             25             17            114
 Rust                             2             28              0             97
 Markdown                         2             25              0             94
 YAML                             3              8             10             61
 TOML                             1              2              0             14
===============================================================================
 SUM:                            18            159             57           4560
===============================================================================
```

## Reference
- [『高効率言語 Rust 書きかた・作りかた』](https://www.socym.co.jp/book/1351)

![ref1](https://www.socym.co.jp/wp-content/uploads/2022/120Px_syoei-1.jpg)
