/* eslint-disable no-unused-expressions */
process.env.NODE_CONFIG_DIR = './test/docs/config';
process.env.NODE_ENV = 'test';
// Require the dev-dependencies
const { MongoClient } = require('mongodb');
const mongoUriBuilder = require('mongo-uri-builder');
const debug = require('debug')('campsi:test');
const chai = require('chai');
const expect = chai.expect;
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const builder = require('../../services/docs/lib/modules/queryBuilder');
const fakeId = require('fake-object-id');
const { ObjectId } = require('mongodb');
const { emptyDatabase } = require('../helpers/emptyDatabase');

chai.should();
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

let firstPizza;
let secondPizza;
let thirdPizza;
let fourthPizza;
let fifthPizza;

let firstPizzaWD;
let secondPizzaWD;
let thirdPizzaWD;
let fourthPizzaWD;
let fifthPizzaWD;

let nextPizzaURL;
let previousPizzaUrl;

const owner = {
  _id: fakeId()
};

const services = {
  Docs: require('../../services/docs/lib')
};

function deletePizza(pizzaId) {
  const filter = { _id: new ObjectId(pizzaId) };
  const resource = campsi.services.get('docs').options.resources.pizzas;
  return resource.collection.deleteOne(filter);
}
async function buildPizzaDoc(data, resource, state) {
  const doc = await builder.create({ user: owner, data, resource, state });
  const result = await resource.collection.insertOne(doc);
  return result.insertedId;
}

// Helpers

function extractNavigationLinks(link) {
  const links = {};
  const splitNavLinks = link.split(',');

  if (!link) return links;

  splitNavLinks.forEach(navLink => {
    const linkData = /<([^>]+)>;\s+rel="([^"]+)"/gi.exec(navLink);
    links[linkData[2]] = linkData[1];
  });

  return links;
}

async function createPizzas(state) {
  const resource = campsi.services.get('docs').options.resources.pizzas;
  const pizzas = [];

  for (let i = 0; i < 5; i++) {
    pizzas.push({ data: { name: `margherita_${i}` }, resource, state });
  }

  for await (const item of pizzas) {
    await buildPizzaDoc(item.data, item.resource, item.state);
  }
}

function getPizzaWithLinksInHeaderByState(id, state) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}/${state}`)
      .set({ 'With-Links': true })
      .end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        resolve(res);
      });
  });
}

function getPizzaWithLinksInHeader(id) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}`)
      .set({ 'With-Links': true })
      .end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        resolve(res);
      });
  });
}

function getPizzaWithLinksInHeaderFromURL(url) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(new URL(url).pathname)
      .set({ 'With-Links': true })
      .end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        resolve(res);
      });
  });
}

function getPizzaWithoutLinks(id) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}`)
      .end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        resolve(res);
      });
  });
}

function getPizzaWithLinkOptionSetToFalse(id) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}?withLinks=false`)
      .end((err, res) => {
        if (err) debug(`received an error from chai: ${err.message}`);
        resolve(res);
      });
  });
}

function getPizzaWithoutLinksInHeader(id) {
  return new Promise(resolve => {
    chai
      .request(campsi.app)
      .get(`/docs/pizzas/${id}`)
      .set({ 'With-Links': false })
      .end((err, res) => {
        if (err) console.log(`received an error from chai: ${err.message}`);
        resolve(res);
      });
  });
}

// Our parent block
describe('Document links', async () => {
  before(done => {
    emptyDatabase(config).then(() => {
      campsi = new CampsiServer(config.campsi);
      campsi.mount('docs', new services.Docs(config.services.docs));

      campsi.on('campsi/ready', () => {
        server = campsi.listen(config.port);
        done();
      });

      campsi.start().catch(err => {
        debug('Error: %s', err);
      });
    });
  });

  after(done => {
    server.close();
    done();
  });

  it('should create the pizzas', async () => {
    await createPizzas('published');
  });

  it('should create the pizzas', async () => {
    await createPizzas('working_draft');
  });

  /*
   * Test the /GET docs/pizzas route
   */
  it('it should get all the pizzas', async () => {
    const res = await chai.request(campsi.app).get('/docs/pizzas/');

    res.should.have.status(200);
    res.should.not.have.header('link');
    res.should.be.json;
    res.body.should.be.a('array');
    firstPizza = res.body[0].id;
    secondPizza = res.body[1].id;
    thirdPizza = res.body[2].id;
    fourthPizza = res.body[3].id;
    fifthPizza = res.body[4].id;
  });

  it('it should get all the pizzas that are in working draft state', async () => {
    const res = await chai.request(campsi.app).get('/docs/pizzas/?state=working_draft');

    res.should.have.status(200);
    res.should.not.have.header('link');
    res.should.be.json;
    res.body.should.be.a('array');
    firstPizzaWD = res.body[0].id;
    secondPizzaWD = res.body[1].id;
    thirdPizzaWD = res.body[2].id;
    fourthPizzaWD = res.body[3].id;
    fifthPizzaWD = res.body[4].id;
  });

  it('gets first pizza with state working_draft with correct links', async () => {
    const res = await getPizzaWithLinksInHeaderByState(firstPizzaWD, 'working_draft');
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    const nextId = parsedHeaderLinks.next.split('/')[5];
    nextId.should.eq(secondPizzaWD);
    expect(parsedHeaderLinks.previous).to.undefined;
  });

  it('gets 2nd pizza  with state working_draft with correct links', async () => {
    const res = await getPizzaWithLinksInHeaderByState(secondPizzaWD, 'working_draft');
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    const nextId = parsedHeaderLinks.next.split('/')[5];
    nextId.should.eq(thirdPizzaWD);
    const previousID = parsedHeaderLinks.previous.split('/')[5];
    previousID.should.eq(firstPizzaWD);
  });
  it('gets 3rd pizza  with state working_draft with correct links', async () => {
    const res = await getPizzaWithLinksInHeaderByState(thirdPizzaWD, 'working_draft');
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    const nextId = parsedHeaderLinks.next.split('/')[5];
    nextId.should.eq(fourthPizzaWD);
    const previousID = parsedHeaderLinks.previous.split('/')[5];
    previousID.should.eq(secondPizzaWD);
  });
  it('gets 4th pizza  with state working_draft with correct links', async () => {
    const res = await getPizzaWithLinksInHeaderByState(fourthPizzaWD, 'working_draft');
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    const nextId = parsedHeaderLinks.next.split('/')[5];
    nextId.should.eq(fifthPizzaWD);
    const previousID = parsedHeaderLinks.previous.split('/')[5];
    previousID.should.eq(thirdPizzaWD);
  });
  it('gets 5th pizza  with state working_draft with correct links', async () => {
    const res = await getPizzaWithLinksInHeaderByState(fifthPizzaWD, 'working_draft');
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    expect(parsedHeaderLinks.next).to.undefined;
    const previousID = parsedHeaderLinks.previous.split('/')[5];
    previousID.should.eq(fourthPizzaWD);
  });
  it('gets first pizza with correct links', async () => {
    const res = await getPizzaWithLinksInHeader(firstPizza);
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(secondPizza);
    expect(parsedHeaderLinks.previous).to.undefined;
  });
  it('gets 2nd pizza with correct links', async () => {
    const res = await getPizzaWithLinksInHeader(secondPizza);
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(thirdPizza);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(firstPizza);
  });
  it('gets third pizza with correct links', async () => {
    const res = await getPizzaWithLinksInHeader(thirdPizza);
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(secondPizza);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(fourthPizza);
  });
  it('gets fourth pizza with correct links', async () => {
    const res = await getPizzaWithLinksInHeader(fourthPizza);
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(thirdPizza);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(fifthPizza);
  });
  it('gets fifth pizza with correct links', async () => {
    const res = await getPizzaWithLinksInHeader(fifthPizza);
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(fourthPizza);
    expect(parsedHeaderLinks.next).to.undefined;
  });
  it('gets first pizza and nvaigates to the 2nd pizza via next URL', async () => {
    const res = await getPizzaWithLinksInHeader(firstPizza);
    const headerLinks = res.headers.link;

    expect(headerLinks).to.not.be.undefined;
    res.body.id.should.eq(firstPizza);
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(secondPizza);
    expect(parsedHeaderLinks.previous).to.undefined;
    nextPizzaURL = parsedHeaderLinks.next;
  });
  it('gets 2nd pizza from next url and navigates to the 3rd pizza via next URL', async () => {
    const res = await getPizzaWithLinksInHeaderFromURL(nextPizzaURL);
    const headerLinks = res.headers.link;
    expect(headerLinks).to.not.be.undefined;
    res.body.id.should.eq(secondPizza);
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(thirdPizza);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(firstPizza);
    nextPizzaURL = parsedHeaderLinks.next;
  });
  it('gets 3rd pizza from next url and navigates to the 4th pizza via next URL', async () => {
    const res = await getPizzaWithLinksInHeaderFromURL(nextPizzaURL);
    const headerLinks = res.headers.link;

    expect(headerLinks).to.not.be.undefined;
    res.body.id.should.eq(thirdPizza);
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(fourthPizza);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(secondPizza);
    nextPizzaURL = parsedHeaderLinks.next;
  });
  it('gets 4th pizza from next url and navigates to the 5th pizza via next URL', async () => {
    const res = await getPizzaWithLinksInHeaderFromURL(nextPizzaURL);
    const headerLinks = res.headers.link;

    expect(headerLinks).to.not.be.undefined;
    res.body.id.should.eq(fourthPizza);
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(fifthPizza);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(thirdPizza);
    nextPizzaURL = parsedHeaderLinks.next;
  });
  it('gets 5th pizza from next url and can not navigate any further forward', async () => {
    const res = await getPizzaWithLinksInHeaderFromURL(nextPizzaURL);
    const headerLinks = res.headers.link;

    expect(headerLinks).to.not.be.undefined;
    expect(headerLinks.next).to.be.undefined;
    res.body.id.should.eq(fifthPizza);
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(fourthPizza);
    previousPizzaUrl = parsedHeaderLinks.previous;
  });
  it('gets 4th pizza from previous url and navigates to 3rd', async () => {
    const res = await getPizzaWithLinksInHeaderFromURL(previousPizzaUrl);
    const headerLinks = res.headers.link;

    expect(headerLinks).to.not.be.undefined;
    res.body.id.should.eq(fourthPizza);
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(fifthPizza);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(thirdPizza);
    previousPizzaUrl = parsedHeaderLinks.previous;
  });
  it('gets 3rd pizza from previous url and navigates to 2nd', async () => {
    const res = await getPizzaWithLinksInHeaderFromURL(previousPizzaUrl);
    const headerLinks = res.headers.link;

    expect(headerLinks).to.not.be.undefined;
    res.body.id.should.eq(thirdPizza);
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(fourthPizza);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(secondPizza);
    previousPizzaUrl = parsedHeaderLinks.previous;
  });
  it('gets 2nd pizza from previous url and navigates to 1st', async () => {
    const res = await getPizzaWithLinksInHeaderFromURL(previousPizzaUrl);
    const headerLinks = res.headers.link;

    expect(headerLinks).to.not.be.undefined;
    res.body.id.should.eq(secondPizza);
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(thirdPizza);
    parsedHeaderLinks.previous.substring(parsedHeaderLinks.previous.lastIndexOf('/') + 1).should.eq(firstPizza);
    previousPizzaUrl = parsedHeaderLinks.previous;
  });
  it('gets 1st pizza from previous url and navigates to 1st', async () => {
    const res = await getPizzaWithLinksInHeaderFromURL(previousPizzaUrl);
    const headerLinks = res.headers.link;

    expect(headerLinks).to.not.be.undefined;
    expect(headerLinks.previous).to.be.undefined;
    res.body.id.should.eq(firstPizza);
    const parsedHeaderLinks = extractNavigationLinks(headerLinks);
    parsedHeaderLinks.next.substring(parsedHeaderLinks.next.lastIndexOf('/') + 1).should.eq(secondPizza);
  });
  it('it should get first pizza with no links returned', async () => {
    const res = await getPizzaWithLinkOptionSetToFalse(firstPizza);
    res.body.id.should.eq(firstPizza);
    expect(res.headers.link).to.be.undefined;
  });
  it('it should get 2nd pizza with no links returned', async () => {
    const res = await getPizzaWithoutLinks(secondPizza);
    res.body.id.should.eq(secondPizza);
    expect(res.headers.link).to.be.undefined;
  });
  it('it should get 3rd pizza with no links returned', async () => {
    const res = await getPizzaWithoutLinksInHeader(thirdPizza);
    res.body.id.should.eq(thirdPizza);
    expect(res.headers.link).to.be.undefined;
  });
  it('it should get 4th pizza with no links returned', async () => {
    const res = await getPizzaWithoutLinks(fourthPizza);
    res.body.id.should.eq(fourthPizza);
    expect(res.headers.link).to.be.undefined;
  });
  it('it should get 5th pizza with no links returned', async () => {
    const res = await getPizzaWithoutLinksInHeader(fifthPizza);
    expect(res.headers.link).to.be.undefined;
    res.body.id.should.eq(fifthPizza);
  });
  it('should fail if I delete a document and ask for it', async () => {
    await deletePizza(fourthPizza);
    const res = await getPizzaWithoutLinksInHeader(fourthPizza);
    expect(res.headers.link).to.be.undefined;
    res.status.should.eq(404);
  });
});
