import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface AuthStackProps extends StackProps {
  isEphemeral: boolean;
  /** Must be globally unique across all Cognito users — pick something like "<yourblog>-admin". */
  cognitoDomainPrefix: string;
  /** Where the admin SPA lives, e.g. https://blog.com/admin — used for the OAuth callback/logout URLs. */
  adminBaseUrl: string;
}

export class AuthStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Single author, no self-signup (PROJECT_SPEC.md section 2) — the one
    // admin user is created manually after deploy via:
    //   aws cognito-idp admin-create-user --user-pool-id <id> --username <email>
    this.userPool = new cognito.UserPool(this, "AdminUserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: props.isEphemeral ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    this.userPoolDomain = this.userPool.addDomain("AdminUserPoolDomain", {
      cognitoDomain: { domainPrefix: props.cognitoDomainPrefix },
    });

    this.userPoolClient = this.userPool.addClient("AdminSpaClient", {
      generateSecret: false, // public client (SPA) — PKCE replaces the client secret
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`${props.adminBaseUrl}/callback`],
        logoutUrls: [`${props.adminBaseUrl}/login`],
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, "CognitoDomain", { value: `${props.cognitoDomainPrefix}.auth.${this.region}.amazoncognito.com` });
  }
}
