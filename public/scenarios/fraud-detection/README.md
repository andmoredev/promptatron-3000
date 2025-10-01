# Enterprise Fraud Detection Scenario

This scenario provides comprehensive fraud detection capabilities with multiple datasets, specialized prompts, and fraud action tools for enterprise-level fraud prevention and risk management.

## Structure

```
fraud-detection/
├── scenario.json          # Main scenario configuration
├── datasets/              # Scenario-specific datasets
│   ├── retail-transactions.csv
│   ├── international.csv
│   ├── mixed.csv
│   └── retail.csv
└── README.md              # This file
```

## Datasets

- **retail-transactions.csv**: Sample retail transaction data for basic fraud analysis
- **international.csv**: Cross-border transaction data with enhanced fraud indicators
- **mixed.csv**: Combined transaction data with various transaction types and risk profiles
- **retail.csv**: Simplified retail transaction dataset for initial fraud detection training

## System Prompts

- **Expert Fraud Detection Analyst**: 10+ years experience in financial crime prevention
- **Senior Risk Management Specialist**: Focused on minimizing losses while maintaining customer experience
- **Fraud Investigation Specialist**: Expertise in complex fraud schemes and pattern recognition
- **AML/Compliance Officer**: Anti-Money Laundering and compliance focus

## Tools

- **freeze_account**: Immediately freeze accounts due to suspected fraud
- **flag_suspicious_transaction**: Flag individual transactions for review
- **create_fraud_alert**: Create alerts for complex fraud patterns
- **update_risk_profile**: Update account risk profiles based on new information

## Usage

1. Select this scenario in the Scenario Selector
2. Choose from the available datasets based on your analysis needs
3. Select appropriate system and user prompts for your use case
4. Run the analysis and use the fraud action tools as needed

## Configuration

- **Streaming**: Enabled by default
- **Custom Prompts**: Allowed
- **Dataset Modification**: Not allowed
- **Max Iterations**: 15
- **Recommended Models**: Claude 3.5 Sonnet, Amazon Nova Pro, Claude 3.5 Haiku
