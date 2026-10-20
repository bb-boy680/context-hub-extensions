# Changelog

## v0.2.0 (2026-10-20)

### Features

- **agents:** deliver prompts through extension providers ([aa30d59](https://github.com/bb-boy680/context-hub-extensions/commit/aa30d598df08811aad7a637cd6b181fe7be86d7c))
- **codex:** add the Codex agent extension ([fd46b82](https://github.com/bb-boy680/context-hub-extensions/commit/fd46b8230fa135ab935b6ed228bcab45aff77f37))
- **market:** publish extension engines ranges ([c4f0883](https://github.com/bb-boy680/context-hub-extensions/commit/c4f0883e8ded059595d207b544a6aa014dff363a))

### Documentation

- add pull request checks screenshot ([52a80bf](https://github.com/bb-boy680/context-hub-extensions/commit/52a80bf68caf68633b7a4b4ce94b3c78efe6e89d))
- add publishing guide ([ace4718](https://github.com/bb-boy680/context-hub-extensions/commit/ace471885f3b037a38ee1f0889c3ba2188d187e4))

### CI

- update changelog through a pull request ([4e612d5](https://github.com/bb-boy680/context-hub-extensions/commit/4e612d5fd21dcd15b15849146615777b80be2e5b))
- build market artifacts on pull requests ([993d56d](https://github.com/bb-boy680/context-hub-extensions/commit/993d56dd54ffa5fbf07dc4d8cbd5673b823163e2))

### Chores

- **claude.code:** bump version to 0.1.1 ([d0ad631](https://github.com/bb-boy680/context-hub-extensions/commit/d0ad6315b0c33ea9f94336016bec07e0c90d1e97))

**Full Changelog**: https://github.com/bb-boy680/context-hub-extensions/compare/v0.1.0...v0.2.0

## v0.1.0 (2026-10-19)

### Features

- add skills.sh and build the market in CI ([8ebfdf2](https://github.com/bb-boy680/context-hub-extensions/commit/8ebfdf2f446804c8701cf225fbb2ae71cbea2c61))
- adopt plugin.yaml and generate the market index ([1abd965](https://github.com/bb-boy680/context-hub-extensions/commit/1abd965b5fa782043a1516b57cdb36a02eb8479c))
- add the demo.other extension ([1bae8fe](https://github.com/bb-boy680/context-hub-extensions/commit/1bae8fec549b7160ba24ad440ad9785e32abb459))
- add the demo.counter extension ([6d96868](https://github.com/bb-boy680/context-hub-extensions/commit/6d968680ad695bee495fcda17e522ab106db69bb))

### Refactoring

- make each plugin a packed workspace package ([13f65ce](https://github.com/bb-boy680/context-hub-extensions/commit/13f65ce0c36b10ae348ae03c67e73f1b075f8949))

### Chores

- ignore marketplace.json by name ([8accf2f](https://github.com/bb-boy680/context-hub-extensions/commit/8accf2f157f67ce14fad2f1e7eebfff29c06186a))
- rely on package versions instead of directory hashes ([706ee28](https://github.com/bb-boy680/context-hub-extensions/commit/706ee28f6f9d4ea4636c94d5b408e9992a034d91))
- rely on the directory hash instead of a pinned commit ([b86ed5c](https://github.com/bb-boy680/context-hub-extensions/commit/b86ed5c73f16cad2602e70abfe242e02dc356cb9))
- declare the extension API version in the index ([bd9af01](https://github.com/bb-boy680/context-hub-extensions/commit/bd9af01613241917a731a16f57742713b6bf2966))
- point the index at the local checkout ([9b64302](https://github.com/bb-boy680/context-hub-extensions/commit/9b643028bd094f4c1957c9b2d1f2eb071ea69926))
- publish the extension index ([d41f53a](https://github.com/bb-boy680/context-hub-extensions/commit/d41f53a47a8dd9011f29e7f008cba014e2600879))
