const chai = require('chai');
const Ajv = require('ajv');
const assert = chai.assert;
const { patch } = require('../../services/docs/lib/modules/queryBuilder');

const ajvWriter = new Ajv();
const options = {
  resource: {
    label: 'project',
    defaultState: 'published',
    states: {
      published: {
        name: 'published',
        label: 'published',
        validate: true
      },
      draft: {
        name: 'draft',
        label: 'draft',
        validate: false
      }
    },
    validate: ajvWriter.compile({
      type: 'object',
      additionalProperties: true,
      properties: {
        name: {
          type: 'string'
        },
        websiteURL: {
          type: 'string'
        },
        DPO: {
          type: 'object',
          additionalProperties: true,
          properties: {
            fullname: {
              type: 'string'
            },
            email: {
              type: 'string'
            },
            address: {
              type: 'string'
            },
            organization: {
              type: 'string'
            },
            telephone: {
              type: 'string'
            }
          }
        },
        documents: {
          type: 'array'
        },
        personalDataUsages: {
          type: 'array'
        }
      },
      title: 'project',
      description:
        'A project represents a website or an app that ask users to accept documents or the usage of their personal data'
    })
  },
  data: {
    'DPO.fullname': 'roro',
    'DPO.address': ''
  },
  user: { _id: 'abc123' },
  validate: true
};

describe('queryBuilder patch function', () => {
  it('should return an object ready to be used in an update mongodb function, with $set and $unset operators', async () => {
    const patchResult = await patch(options);
    if (Object.prototype.toString.call(patchResult.$set['states.published.modifiedAt']) === '[object Date]') {
      // date would be different anyway so we won't compare it
      delete patchResult.$set['states.published.modifiedAt'];
    }
    assert.deepEqual(patchResult, {
      $set: {
        'states.published.modifiedBy': 'abc123',
        'states.published.data.DPO.fullname': 'roro',
        'states.published.data.DPO.address': ''
      }
    });
  });
  it('should return an object ready to be used in an update mongodb function, with only $set operator', async () => {
    delete options.data['DPO.address'];
    const patchResult = await patch(options);
    if (Object.prototype.toString.call(patchResult.$set['states.published.modifiedAt']) === '[object Date]') {
      // date would be different anyway so we won't compare it
      delete patchResult.$set['states.published.modifiedAt'];
    }
    assert.deepEqual(patchResult, {
      $set: {
        'states.published.modifiedBy': 'abc123',
        'states.published.data.DPO.fullname': 'roro'
      }
    });
  });
});
