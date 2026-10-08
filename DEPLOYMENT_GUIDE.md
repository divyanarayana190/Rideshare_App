# RideShare App - Complete Deployment Guide

Deploy your RideShare backend and mobile app to production across multiple platforms.

## 📋 Table of Contents

1. [Backend Deployment](#backend-deployment)
2. [Mobile App Deployment](#mobile-app-deployment)
3. [Database Setup](#database-setup)
4. [CI/CD Pipeline](#cicd-pipeline)
5. [Monitoring & Logging](#monitoring--logging)
6. [Scaling & Performance](#scaling--performance)

---

## 🚀 Backend Deployment

### Option 1: Deploy to Vercel (Recommended for Beginners)

Vercel is the easiest way to deploy Node.js backends with automatic scaling.

#### 1.1 Prerequisites

```bash
npm install -g vercel
vercel login
```

#### 1.2 Configure Build Settings

Create `vercel.json` in project root:

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "env": {
    "NODE_ENV": "production",
    "DATABASE_URL": "@database_url",
    "TWILIO_ACCOUNT_SID": "@twilio_account_sid",
    "TWILIO_AUTH_TOKEN": "@twilio_auth_token",
    "STRIPE_SECRET_KEY": "@stripe_secret_key",
    "FIREBASE_PROJECT_ID": "@firebase_project_id"
  },
  "functions": {
    "server/_core/index.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

#### 1.3 Deploy

```bash
# First deployment
vercel

# Subsequent deployments
vercel --prod
```

#### 1.4 Set Environment Variables

```bash
vercel env add DATABASE_URL
vercel env add TWILIO_ACCOUNT_SID
vercel env add TWILIO_AUTH_TOKEN
vercel env add STRIPE_SECRET_KEY
vercel env add FIREBASE_PROJECT_ID
vercel env add FIREBASE_PRIVATE_KEY
vercel env add FIREBASE_CLIENT_EMAIL
```

#### 1.5 Verify Deployment

```bash
# Check deployment status
vercel ls

# View logs
vercel logs

# Test API
curl https://your-project.vercel.app/api/health
```

---

### Option 2: Deploy to AWS Lambda

AWS Lambda is ideal for serverless, pay-per-use deployments.

#### 2.1 Prerequisites

```bash
npm install -g aws-cdk
aws configure
```

#### 2.2 Create CDK Stack

Create `cdk/rideshare-stack.ts`:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';

export class RideShareStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda function
    const handler = new lambda.Function(this, 'RideShareHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('dist'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        DATABASE_URL: process.env.DATABASE_URL || '',
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
      },
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'RideShareAPI', {
      restApiName: 'RideShare API',
      description: 'RideShare backend API',
    });

    api.root.addMethod('ANY', new apigateway.LambdaIntegration(handler));
  }
}
```

#### 2.3 Deploy

```bash
# Build
pnpm build

# Deploy
cdk deploy

# Get API endpoint
aws apigateway get-rest-apis --query 'items[0].id'
```

#### 2.4 Configure RDS Database

```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier rideshare-db \
  --db-instance-class db.t3.micro \
  --engine mysql \
  --master-username admin \
  --master-user-password YourSecurePassword123!
```

---

### Option 3: Deploy to Firebase Functions

Firebase Functions integrates seamlessly with Firebase services.

#### 3.1 Prerequisites

```bash
npm install -g firebase-tools
firebase login
firebase init functions
```

#### 3.2 Configure Functions

Create `functions/src/index.ts`:

```typescript
import * as functions from 'firebase-functions';
import * as express from 'express';

const app = express();

// Import your tRPC router
// import { appRouter } from '../../server/routers';

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export const api = functions.https.onRequest(app);
```

#### 3.3 Configure firebase.json

```json
{
  "functions": {
    "source": "functions",
    "runtime": "nodejs18",
    "codebase": "default"
  },
  "hosting": {
    "public": "public",
    "rewrites": [
      {
        "source": "/api/**",
        "function": "api"
      }
    ]
  }
}
```

#### 3.4 Deploy

```bash
firebase deploy --only functions,hosting
```

---

## 📱 Mobile App Deployment

### iOS Deployment

#### 1. Build for App Store

```bash
eas build --platform ios --auto-submit
```

#### 2. Configure App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Create new app
3. Fill in app details:
   - App name: RideShare
   - Bundle ID: `space.manus.rideshare.app.t{timestamp}`
   - SKU: `rideshare-2024`
4. Add screenshots, description, pricing
5. Submit for review

#### 3. Monitor Submission

```bash
eas submit --platform ios --latest
```

### Android Deployment

#### 1. Build for Play Store

```bash
eas build --platform android --auto-submit
```

#### 2. Configure Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Create new app
3. Fill in app details:
   - App name: RideShare
   - Package name: `space.manus.rideshare.app.t{timestamp}`
   - Category: Transportation
4. Add screenshots, description, pricing
5. Submit for review

#### 3. Monitor Submission

```bash
eas submit --platform android --latest
```

---

## 🗄️ Database Setup

### MySQL on AWS RDS

#### 1. Create Database

```bash
aws rds create-db-instance \
  --db-instance-identifier rideshare-prod \
  --db-instance-class db.t3.small \
  --engine mysql \
  --engine-version 8.0.28 \
  --master-username admin \
  --master-user-password YourSecurePassword123! \
  --allocated-storage 100 \
  --storage-type gp2 \
  --backup-retention-period 7 \
  --multi-az
```

#### 2. Configure Security Group

```bash
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 3306 \
  --cidr 0.0.0.0/0
```

#### 3. Run Migrations

```bash
DATABASE_URL="mysql://admin:password@rideshare-prod.xxxxx.us-east-1.rds.amazonaws.com:3306/rideshare" \
pnpm db:push
```

### PostgreSQL on Heroku

```bash
# Create database
heroku addons:create heroku-postgresql:standard-0 --app rideshare

# Get connection string
heroku config:get DATABASE_URL

# Run migrations
DATABASE_URL="..." pnpm db:push
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy RideShare

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm check
      - run: pnpm lint
      - run: pnpm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm build
      
      - name: Deploy to Vercel
        run: |
          npm install -g vercel
          vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

### GitLab CI/CD

Create `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - build
  - deploy

test:
  stage: test
  image: node:18
  script:
    - npm install -g pnpm
    - pnpm install
    - pnpm check
    - pnpm lint
    - pnpm test

build:
  stage: build
  image: node:18
  script:
    - npm install -g pnpm
    - pnpm install
    - pnpm build
  artifacts:
    paths:
      - dist/

deploy:
  stage: deploy
  image: node:18
  script:
    - npm install -g vercel
    - vercel --prod --token $VERCEL_TOKEN
  only:
    - main
```

---

## 📊 Monitoring & Logging

### Application Monitoring

#### Sentry (Error Tracking)

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

#### DataDog (Performance Monitoring)

```typescript
import tracer from 'dd-trace';

tracer.init({
  service: 'rideshare-api',
  env: process.env.NODE_ENV,
  version: '1.0.0',
});
```

### Database Monitoring

```bash
# Monitor slow queries
mysql> SET GLOBAL slow_query_log = 'ON';
mysql> SET GLOBAL long_query_time = 2;

# Check replication status
mysql> SHOW SLAVE STATUS\G

# Monitor connections
mysql> SHOW PROCESSLIST;
```

### API Monitoring

```typescript
// Track API response times
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});
```

---

## 📈 Scaling & Performance

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_rides_driver_id ON rides(driver_id);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_passengers_ride_id ON passengers(ride_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);

-- Enable query caching
SET GLOBAL query_cache_type = 1;
SET GLOBAL query_cache_size = 268435456;
```

### API Caching

```typescript
import redis from 'redis';

const client = redis.createClient({
  host: process.env.REDIS_HOST,
  port: 6379,
});

// Cache ride listings
app.get('/api/rides', async (req, res) => {
  const cacheKey = `rides:${req.query.origin}:${req.query.destination}`;
  const cached = await client.get(cacheKey);
  
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  const rides = await db.query('SELECT * FROM rides WHERE ...');
  await client.setex(cacheKey, 300, JSON.stringify(rides));
  res.json(rides);
});
```

### Load Balancing

```bash
# AWS Elastic Load Balancer
aws elbv2 create-load-balancer \
  --name rideshare-alb \
  --subnets subnet-12345 subnet-67890 \
  --security-groups sg-12345 \
  --scheme internet-facing \
  --type application
```

### Auto-Scaling

```bash
# AWS Auto Scaling Group
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name rideshare-asg \
  --launch-configuration-name rideshare-lc \
  --min-size 2 \
  --max-size 10 \
  --desired-capacity 3 \
  --availability-zones us-east-1a us-east-1b
```

---

## ✅ Pre-Deployment Checklist

- [ ] All tests passing
- [ ] TypeScript compilation successful
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] API endpoints tested
- [ ] Security headers configured
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Monitoring set up
- [ ] Backup strategy defined
- [ ] Disaster recovery plan
- [ ] Performance benchmarks met
- [ ] Security audit completed

---

## 🆘 Troubleshooting

### Deployment Fails

```bash
# Check logs
vercel logs --tail

# Rebuild
vercel rebuild

# Check environment variables
vercel env ls
```

### Database Connection Error

```bash
# Test connection
mysql -h your-db-host -u admin -p

# Check security groups
aws ec2 describe-security-groups

# Verify DATABASE_URL
echo $DATABASE_URL
```

### API Not Responding

```bash
# Check server status
curl https://your-api.com/health

# Check logs
aws logs tail /aws/lambda/rideshare

# Restart function
aws lambda update-function-configuration --function-name rideshare
```

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [AWS Lambda Guide](https://docs.aws.amazon.com/lambda/)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)
- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer/)

---

**Your RideShare app is ready for production deployment!** 🚀
