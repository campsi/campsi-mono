## [5.1.1](https://github.com/campsi/campsi-mono/compare/v5.1.0...v5.1.1) (2024-03-11)


### Bug Fixes

* more accurate error message for createResetPasswordToken ([#282](https://github.com/campsi/campsi-mono/issues/282)) ([ced07f6](https://github.com/campsi/campsi-mono/commit/ced07f697599fcf15d41a4c25985c3923bc3dbfc))

# [5.1.0](https://github.com/campsi/campsi-mono/compare/v5.0.1...v5.1.0) (2024-03-06)


### Features

* Add 'in' operator for Numbers ([#281](https://github.com/campsi/campsi-mono/issues/281)) ([f058ae1](https://github.com/campsi/campsi-mono/commit/f058ae15f261746bf4e24c698dab77b36f252e96))

## [5.0.1](https://github.com/campsi/campsi-mono/compare/v5.0.0...v5.0.1) (2024-02-13)


### Bug Fixes

* patch with missing update ([96d9920](https://github.com/campsi/campsi-mono/commit/96d992088abfed140f8b13d02dde560471b09b04))

# [5.0.0](https://github.com/campsi/campsi-mono/compare/v4.1.0...v5.0.0) (2024-02-13)


### Features

* upgrade mongodb node driver (DEV-4642) ([#280](https://github.com/campsi/campsi-mono/issues/280)) ([4a6f939](https://github.com/campsi/campsi-mono/commit/4a6f93902ac0033008271da540b5d30b03e362d9))


### BREAKING CHANGES

* due to v5 => v6 breaking changes updates

* feat: auth unit tests fixed

* wip

* fix: unit tests

* fix: unit tests bodyparser warning

* chore: code cleanup

# [4.1.0](https://github.com/campsi/campsi-mono/compare/v4.0.0...v4.1.0) (2024-01-15)


### Features

* allow returning metadata for getDocuments ([#279](https://github.com/campsi/campsi-mono/issues/279)) ([c5dfded](https://github.com/campsi/campsi-mono/commit/c5dfded97ea90bab665ef06f6e0c834cf254e135))

# [4.0.0](https://github.com/campsi/campsi-mono/compare/v3.5.0...v4.0.0) (2024-01-11)


### Features

* getUsersCollectionName and getSessionCollectionName replaced (DEV-3556) ([#278](https://github.com/campsi/campsi-mono/issues/278)) ([77ef05a](https://github.com/campsi/campsi-mono/commit/77ef05ab8875f506791fc73d13e43d0ad335c30b))


### BREAKING CHANGES

* an option (authServicePath) is required in services config if multiple AuthService are instantiated

* fix: auth unit tests

* feat: getSessionName as a function based on auth service

unit tests fixed
* an option (authServicePath) is required in services config if multiple AuthService are instantiated

* chore: code cleanup

* chore: file renamed for consistency

* feat: dropIndexes in emptyDatabase (tests)

# [3.5.0](https://github.com/campsi/campsi-mono/compare/v3.4.0...v3.5.0) (2023-12-18)


### Features

* additional middlewares per resource/method ([#275](https://github.com/campsi/campsi-mono/issues/275)) ([1c6103f](https://github.com/campsi/campsi-mono/commit/1c6103fce41cfb116fba8c6ed73105281dd61583))

# [3.4.0](https://github.com/campsi/campsi-mono/compare/v3.3.2...v3.4.0) (2023-11-24)


### Features

* add currency to subscription creation payload ([#271](https://github.com/campsi/campsi-mono/issues/271)) ([af884bd](https://github.com/campsi/campsi-mono/commit/af884bd6dcb45d344da7fc4ff28c8ad0383c4806))

## [3.3.2](https://github.com/campsi/campsi-mono/compare/v3.3.1...v3.3.2) (2023-11-24)


### Bug Fixes

* Improve paginateQuery helper ([#272](https://github.com/campsi/campsi-mono/issues/272)) ([5d7f74e](https://github.com/campsi/campsi-mono/commit/5d7f74e13a99f11c173c751c842a9d897ddbb163))

## [3.3.1](https://github.com/campsi/campsi-mono/compare/v3.3.0...v3.3.1) (2023-11-14)


### Bug Fixes

* this undefined in local.js (not arrow function) ([#269](https://github.com/campsi/campsi-mono/issues/269)) ([b2c35e2](https://github.com/campsi/campsi-mono/commit/b2c35e217d493cbaacef5839868d35bcad2fcbc9))

# [3.3.0](https://github.com/campsi/campsi-mono/compare/v3.2.0...v3.3.0) (2023-11-09)


### Features

* allow to create a password reset token without a HTTP request ([#268](https://github.com/campsi/campsi-mono/issues/268)) ([2218dcb](https://github.com/campsi/campsi-mono/commit/2218dcb4c820bcbedda331186a1f2df6df54a61d))

# [3.2.0](https://github.com/campsi/campsi-mono/compare/v3.1.0...v3.2.0) (2023-10-24)


### Features

* add invitedBy to signup local event payload ([#267](https://github.com/campsi/campsi-mono/issues/267)) ([5d5eb54](https://github.com/campsi/campsi-mono/commit/5d5eb5461f5b22ccbe5f0bc85ef353f3e971a34d))

# [3.1.0](https://github.com/campsi/campsi-mono/compare/v3.0.8...v3.1.0) (2023-10-23)


### Features

* add TTL index option for audit service ([#266](https://github.com/campsi/campsi-mono/issues/266)) ([112b0a9](https://github.com/campsi/campsi-mono/commit/112b0a99966690de03f632ffe1942510a8376150))

## [3.0.8](https://github.com/campsi/campsi-mono/compare/v3.0.7...v3.0.8) (2023-10-18)


### Bug Fixes

* Can't render headers after they are sent to the client ([aad76e5](https://github.com/campsi/campsi-mono/commit/aad76e560ef87cc6db6776281b026a9739a21f62))

## [3.0.7](https://github.com/campsi/campsi-mono/compare/v3.0.6...v3.0.7) (2023-10-18)


### Bug Fixes

* redirectURI not properly working with local provider ([#262](https://github.com/campsi/campsi-mono/issues/262)) ([97b8add](https://github.com/campsi/campsi-mono/commit/97b8add07cc17ae3079aee82b5e21cecfaad4b3a))

## [3.0.6](https://github.com/campsi/campsi-mono/compare/v3.0.5...v3.0.6) (2023-10-13)


### Bug Fixes

* allowDiskUse missing from getDocuments ([#263](https://github.com/campsi/campsi-mono/issues/263)) ([0573f49](https://github.com/campsi/campsi-mono/commit/0573f494c2fb2bcfcc2c1d3489b883ae5baf3d0d))

## [3.0.5](https://github.com/campsi/campsi-mono/compare/v3.0.4...v3.0.5) (2023-10-10)


### Bug Fixes

* **auth:** email is no more updatable by PATCH /me ([bab9d95](https://github.com/campsi/campsi-mono/commit/bab9d95752afeb8189907e3bd64aa7ca30922aaf))

## [3.0.4](https://github.com/campsi/campsi-mono/compare/v3.0.3...v3.0.4) (2023-09-28)


### Bug Fixes

* trigger build new version ([e757de9](https://github.com/campsi/campsi-mono/commit/e757de99c20561d26ae651a63a0c46d2769bd868))

## [3.0.3](https://github.com/campsi/campsi-mono/compare/v3.0.2...v3.0.3) (2023-09-19)


### Bug Fixes

* update swagger doc ([#259](https://github.com/campsi/campsi-mono/issues/259)) ([5fcfea0](https://github.com/campsi/campsi-mono/commit/5fcfea0336461d89694c97a27937078fa199ccd7))

## [3.0.2](https://github.com/campsi/campsi-mono/compare/v3.0.1...v3.0.2) (2023-09-14)


### Bug Fixes

* validate docs write access (DEV-4175) ([#258](https://github.com/campsi/campsi-mono/issues/258)) ([0b91ad2](https://github.com/campsi/campsi-mono/commit/0b91ad268b370a1583de50e6ac22f7135309f01c))

## [3.0.1](https://github.com/campsi/campsi-mono/compare/v3.0.0...v3.0.1) (2023-08-31)


### Bug Fixes

* patch requests only validate the payload (DEV-4094) ([#257](https://github.com/campsi/campsi-mono/issues/257)) ([e4b5ec7](https://github.com/campsi/campsi-mono/commit/e4b5ec7b6558f1c5ba7bfa5106a5f00da0267509))

# [3.0.0](https://github.com/campsi/campsi-mono/compare/v2.24.1...v3.0.0) (2023-08-30)


### Features

* update aws sdk to v3 (DEV-3967) ([#255](https://github.com/campsi/campsi-mono/issues/255)) ([46f778e](https://github.com/campsi/campsi-mono/commit/46f778e7949743cee7e1d75d17410c2ed3d667d2))


### BREAKING CHANGES

* aws-sdk v2 -> v3
