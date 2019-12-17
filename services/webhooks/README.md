# Campsi Webhooks Service

[![Greenkeeper badge](https://badges.greenkeeper.io/campsi/campsi-service-webhooks.svg)](https://greenkeeper.io/)
[![Build Status][build-image]][build-url]
[![Coverage Status][coverage-image]][coverage-url]
[![Known Vulnerabilities][vulnerabilities-image]][vulnerabilities-url]

Webhooks are configurable callbacks over HTTP that are sent when an event 
with a matching name is triggered.

## Service config options
- `channel` *String* prefix of the event that may trigger webhooks, defaults to `webhooks`
- `requireAuth` *Bool* wether the webhooks have to be attached to a user, defaults to `true`

## API
### Create a new Webhook
`GET /:service/`
Returns all the webhooks configured.

`POST /:service/`
Expecting a JSON body containing the following properties
- `uri` the URI the request will be sent
- `event` the name of the event that should trigger the webhook
- `method` (optional) the HTTP verb used.
- `headers` (optional) an object containing the headers that should be sent with the request

`DELETE /:service/:webhook_id`
Removes a webhook based on its id.

## TODO
 - [ ] isAdmin
 - [ ] paginateCursor
 - [ ] event authorization (check if the owner of the webhook is authorized to listen to such event)
 
[build-image]: https://travis-ci.org/campsi/campsi-service-webhooks.svg?branch=master
[build-url]: https://travis-ci.org/campsi/campsi-service-webhooks

[coverage-image]: https://coveralls.io/repos/github/campsi/campsi-service-webhooks/badge.svg?branch=master
[coverage-url]: https://coveralls.io/github/campsi/campsi-service-webhooks?branch=master

[vulnerabilities-image]: https://snyk.io/test/github/campsi/campsi-service-webhooks/badge.svg
[vulnerabilities-url]: https://snyk.io/test/github/campsi/campsi-service-webhooks
