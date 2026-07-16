import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
// Keep these schema names aligned with packages/shared/src/dynamo.ts. They
// are repeated here intentionally: CDK executes through ts-node/CommonJS,
// while @blog/shared is an ESM browser/Lambda package and cannot be required
// by the CDK process at synth time.
const TABLE_PARTITION_KEY = "PK";
const TABLE_SORT_KEY = "SK";
const STATUS_DATE_INDEX_NAME = "StatusDateIndex";
const STATUS_DATE_INDEX_PARTITION_KEY = "GSI2PK";
const STATUS_DATE_INDEX_SORT_KEY = "GSI2SK";

export class DataStack extends Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StackProps & { isEphemeral: boolean }) {
    super(scope, id, props);

    // Production keeps PITR as the safety net for accidental edits/deletes.
    // Homologation is intentionally disposable and avoids that extra cost.
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
