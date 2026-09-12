import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationAddress } from './entities/organization-address.entity';
import { OrganizationTax } from './entities/organization-tax.entity';
import { OrganizationSettings } from './entities/organization-settings.entity';
import { Branch } from './entities/branch.entity';
import { OrganizationContact } from './entities/organization-contact.entity';
import { OrganizationBankAccount } from './entities/organization-bank-account.entity';
import { OrganizationDocument } from './entities/organization-document.entity';
import { Employee } from '../employees/entities/employee.entity';

import { OrganizationService } from './services/organization.service';
import { OrganizationAddressService } from './services/organization-address.service';
import { OrganizationTaxService } from './services/organization-tax.service';
import { OrganizationSettingsService } from './services/organization-settings.service';
import { BranchService } from './services/branch.service';
import { OrganizationContactService } from './services/organization-contact.service';
import { OrganizationBankAccountService } from './services/organization-bank-account.service';
import { OrganizationDocumentService } from './services/organization-document.service';
import { OrganizationController } from './organization.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      OrganizationAddress,
      OrganizationTax,
      OrganizationSettings,
      Branch,
      OrganizationContact,
      OrganizationBankAccount,
      OrganizationDocument,
      Employee,
    ]),
  ],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    OrganizationAddressService,
    OrganizationTaxService,
    OrganizationSettingsService,
    BranchService,
    OrganizationContactService,
    OrganizationBankAccountService,
    OrganizationDocumentService,
  ],
  exports: [
    OrganizationService,
    OrganizationAddressService,
    OrganizationTaxService,
    OrganizationSettingsService,
  ],
})
export class OrganizationModule {}
