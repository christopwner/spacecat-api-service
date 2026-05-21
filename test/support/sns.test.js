/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */

import wrap from '@adobe/helix-shared-wrap';
import sinon from 'sinon';
import { use, expect } from 'chai';
import sinonChai from 'sinon-chai';
import chaiAsPromised from 'chai-as-promised';
import snsWrapper, { SNS } from '../../src/support/sns.js';

use(sinonChai);
use(chaiAsPromised);

const sandbox = sinon.createSandbox();

describe('sns', () => {
  let context;
  const AWS_REGION = 'us-east-1';
  const TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:spacecat-autofix-jobs';

  beforeEach('setup', () => {
    context = {
      log: {
        info: sandbox.stub(),
        warn: sandbox.stub(),
        error: sandbox.stub(),
        debug: sandbox.stub(),
      },
      runtime: {
        region: AWS_REGION,
      },
    };
  });

  afterEach('clean', () => {
    sandbox.restore();
  });

  describe('publish', () => {
    it('publishes a message successfully', async () => {
      const sns = new SNS(AWS_REGION, context.log);
      const messageId = 'test-message-id-123';
      sns.snsClient.send = sandbox.stub().resolves({ MessageId: messageId });

      await sns.publish(TOPIC_ARN, { key: 'value' });

      expect(sns.snsClient.send).to.have.been.calledOnce;
      expect(context.log.debug).to.have.been.calledWith(
        `Success, message published. MessageId: ${messageId}`,
      );
    });

    it('propagates publish errors and logs them', async () => {
      const sns = new SNS(AWS_REGION, context.log);
      const error = Object.assign(new Error('Access denied'), {
        name: 'AuthorizationError',
        $metadata: { httpStatusCode: 403 },
      });
      sns.snsClient.send = sandbox.stub().rejects(error);

      await expect(sns.publish(TOPIC_ARN, { key: 'value' }))
        .to.be.rejectedWith('Access denied');

      expect(context.log.error).to.have.been.calledWith(
        'Publish failed. Type: AuthorizationError, HTTP: 403, Message: Access denied',
      );
    });

    it('throws when topicArn is not a full SNS ARN', async () => {
      const sns = new SNS(AWS_REGION, context.log);

      await expect(sns.publish('spacecat-autofix-jobs', { key: 'value' }))
        .to.be.rejectedWith('AUTOFIX_JOBS_TOPIC_ARN must be a full SNS ARN');
    });

    it('throws when topicArn is undefined', async () => {
      const sns = new SNS(AWS_REGION, context.log);

      await expect(sns.publish(undefined, { key: 'value' }))
        .to.be.rejectedWith('AUTOFIX_JOBS_TOPIC_ARN must be a full SNS ARN');
    });

    it('does not inject timestamp into message payload', async () => {
      const sns = new SNS(AWS_REGION, context.log);
      const capturedInputs = [];
      sns.snsClient.send = sandbox.stub().callsFake((cmd) => {
        capturedInputs.push(cmd.input);
        return Promise.resolve({ MessageId: 'msg-id' });
      });

      const message = { opportunityId: 'opp-1', siteId: 'site-1' };
      await sns.publish(TOPIC_ARN, message);

      const published = JSON.parse(capturedInputs[0].Message);
      expect(published).to.not.have.property('timestamp');
      expect(published).to.deep.equal(message);
    });
  });

  describe('snsWrapper', () => {
    it('does not reinitialize sns if already present in context', async () => {
      const existingInstance = {
        publish: sandbox.stub().resolves(),
      };
      context.sns = existingInstance;

      await wrap(async (req, ctx) => {
        await ctx.sns.publish(TOPIC_ARN, { key: 'value' });
      }).with(snsWrapper)({}, context);

      expect(existingInstance.publish).to.have.been.calledOnce;
    });

    it('initializes sns if not present in context', async () => {
      const stub = sandbox.stub().resolves({ MessageId: 'msg-id' });

      await wrap(async (req, ctx) => {
        ctx.sns.snsClient.send = stub;
        await ctx.sns.publish(TOPIC_ARN, { key: 'value' });
      }).with(snsWrapper)({}, context);

      expect(stub).to.have.been.calledOnce;
    });
  });
});
