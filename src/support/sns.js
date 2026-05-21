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
import {
  SNSClient,
  PublishCommand,
} from '@aws-sdk/client-sns';

/**
 * @class SNS utility to publish messages to SNS
 * @param {string} region - AWS region
 * @param {object} log - log object (expects .debug() / .error())
 */
export class SNS {
  constructor(region, log) {
    this.snsClient = new SNSClient({ region });
    this.log = log;
  }

  /**
   * Publish a message to the specified SNS topic.
   *
   * @param {string} topicArn - Full SNS topic ARN (must start with "arn:aws:sns:")
   * @param {object} message - The message payload (will be JSON.stringified)
   * @param {object} [options]
   * @param {string} [options.messageGroupId] - Required for FIFO topics
   * @param {string} [options.messageDeduplicationId] - Optional for FIFO topics (if content-based dedup is disabled)
   * @param {Record<string,{DataType:'String'|'Number'|'Binary',StringValue?:string,BinaryValue?:Uint8Array}>} [options.messageAttributes]
   * @returns {Promise<void>}
   */
  async publish(topicArn, message, options = {}) {
    const resolvedArn = this.#toTopicArn(topicArn);

    const cmd = new PublishCommand({
      TopicArn: resolvedArn,
      Message: JSON.stringify(message),
      // FIFO-only fields (safe to pass undefined for standard topics)
      MessageGroupId: options.messageGroupId,
      MessageDeduplicationId: options.messageDeduplicationId,
      MessageAttributes: options.messageAttributes,
    });

    try {
      const data = await this.snsClient.send(cmd);
      this.log.debug(
        `Success, message published. MessageId: ${data.MessageId}`,
      );
    } catch (e) {
      const { name: type, $metadata, message: msg } = e;
      this.log.error(
        `Publish failed. Type: ${type}, HTTP: ${$metadata?.httpStatusCode}, Message: ${msg}`,
      );
      throw e;
    }
  }

  /**
   * Validate and return the topic ARN.
   * Throws if the value is not a full SNS ARN — AUTOFIX_JOBS_TOPIC_ARN must be provisioned
   * in Terraform and passed as the full ARN to fail fast on misconfiguration.
   *
   * @param {string} topicArn
   * @returns {string} Topic ARN
   */
  // eslint-disable-next-line class-methods-use-this
  #toTopicArn(topicArn) {
    if (typeof topicArn !== 'string' || !topicArn.startsWith('arn:aws:sns:')) {
      throw new Error('AUTOFIX_JOBS_TOPIC_ARN must be a full SNS ARN (e.g. arn:aws:sns:us-east-1:123456789012:spacecat-autofix-jobs)');
    }
    return topicArn;
  }
}

/**
 * Wrapper to attach SNS to your context, mirroring sqsWrapper ergonomics.
 */
export default function snsWrapper(fn) {
  return async (request, context) => {
    if (!context.sns) {
      const { log } = context;
      const { region } = context.runtime;
      context.sns = new SNS(region, log);
    }
    return fn(request, context);
  };
}
