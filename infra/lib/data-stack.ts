import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import {
  STATUS_DATE_INDEX_NAME,
  STATUS_DATE_INDEX_PARTITION_KEY,
  STATUS_DATE_INDEX_SORT_KEY,
  TABLE_PARTITION_KEY,
  TABLE_SORT_KEY,
} from "@blog/shared";

export class DataStack extends Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StackProps & { isEphemeral: boolean }) {
    super(scope, id, props);

    // PITR is the safety net for the single-admin, no-review workflow
    // (PROJECT_SPEC.md section 13.1): restores the whole table to any point
    // in the last 35 days if a bad edit/delete needs undoing.
    this.table = new dynamodb.Table(this, "BlogTable", {
      partitionKey: { name: TABLE_PARTITION_KEY, type: dynamodb.AttributeType.STRING },
      sortKey: { name: TABLE_SORT_KEY, type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: !props.isEphemeral },
      removalPolicy: props.isEphemeral ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: STATUS_DATE_INDEX_NAME,
      partitionKey: { name: STATUS_DATE_INDEX_PARTITION_KEY, type: dynamodb.AttributeType.STRING },
      sortKey: { name: STATUS_DATE_INDEX_SORT_KEY, type: dynamodb.AttributeType.STRING },
    });

    new CfnOutput(this, "TableName", { value: this.table.tableName });
  }
}
