import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PermissionEnum } from '../../common/enums/permission.enum';

import { OrganizationService } from './services/organization.service';
import { OrganizationAddressService } from './services/organization-address.service';
import { OrganizationTaxService } from './services/organization-tax.service';
import { OrganizationSettingsService } from './services/organization-settings.service';
import { BranchService } from './services/branch.service';
import { OrganizationContactService } from './services/organization-contact.service';
import { OrganizationBankAccountService } from './services/organization-bank-account.service';
import { OrganizationDocumentService } from './services/organization-document.service';

import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateOrganizationAddressDto } from './dto/create-organization-address.dto';
import { UpdateOrganizationAddressDto } from './dto/update-organization-address.dto';
import { CreateOrganizationTaxDto } from './dto/create-organization-tax.dto';
import { UpdateOrganizationTaxDto } from './dto/update-organization-tax.dto';
import { CreateOrganizationSettingsDto } from './dto/create-organization-settings.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';

import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateOrganizationContactDto } from './dto/create-organization-contact.dto';
import { UpdateOrganizationContactDto } from './dto/update-organization-contact.dto';
import { CreateOrganizationBankAccountDto } from './dto/create-organization-bank-account.dto';
import { UpdateOrganizationBankAccountDto } from './dto/update-organization-bank-account.dto';
import { CreateOrganizationDocumentDto } from './dto/create-organization-document.dto';
import { UpdateOrganizationDocumentDto } from './dto/update-organization-document.dto';

@ApiTags('Organization')
@Controller('organization')
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly addressService: OrganizationAddressService,
    private readonly taxService: OrganizationTaxService,
    private readonly settingsService: OrganizationSettingsService,
    private readonly branchService: BranchService,
    private readonly contactService: OrganizationContactService,
    private readonly bankAccountService: OrganizationBankAccountService,
    private readonly documentService: OrganizationDocumentService,
  ) {}

  // --- Organization Core ---

  @Get()
  @Permissions(PermissionEnum.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get the singleton organization profile' })
  async getOrganization() {
    return this.organizationService.get();
  }

  @Post()
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({
    summary: 'Initialize the singleton organization (Internal Bootstrap Use)',
  })
  async createOrganization(
    @Body() createDto: CreateOrganizationDto,
    @CurrentUser() user: any,
  ) {
    return this.organizationService.create(createDto, user?.id);
  }

  @Patch()
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update the organization profile' })
  async updateOrganization(
    @Body() updateDto: UpdateOrganizationDto,
    @CurrentUser() user: any,
  ) {
    return this.organizationService.update(updateDto, user?.id);
  }

  @Post('logo')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Upload organization logo (multipart/form-data)' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/organization',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `logo-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return callback(
            new BadRequestException(
              'Only image files (jpg, jpeg, png, webp) are allowed!',
            ),
            false,
          );
        }
        callback(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    }),
  )
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.organizationService.uploadLogo(file, user?.id);
  }

  @Patch('logo')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({
    summary: 'Replace / update organization logo (multipart/form-data)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/organization',
        filename: (req, file, callback) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `logo-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return callback(
            new BadRequestException(
              'Only image files (jpg, jpeg, png, webp) are allowed!',
            ),
            false,
          );
        }
        callback(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async updateLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.organizationService.uploadLogo(file, user?.id);
  }

  // --- Address ---

  @Post('address')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Add an address to the organization' })
  async createAddress(
    @Body() createDto: CreateOrganizationAddressDto,
    @CurrentUser() user: any,
  ) {
    return this.addressService.create(createDto, user?.id);
  }

  @Patch('address/:id')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update a specific address' })
  async updateAddress(
    @Param('id') id: string,
    @Body() updateDto: UpdateOrganizationAddressDto,
    @CurrentUser() user: any,
  ) {
    return this.addressService.update(id, updateDto, user?.id);
  }

  // --- Tax ---

  @Post('tax')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Set the organization tax profile' })
  async createTax(
    @Body() createDto: CreateOrganizationTaxDto,
    @CurrentUser() user: any,
  ) {
    return this.taxService.create(createDto, user?.id);
  }

  @Patch('tax')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update the organization tax profile' })
  async updateTax(
    @Body() updateDto: UpdateOrganizationTaxDto,
    @CurrentUser() user: any,
  ) {
    return this.taxService.update(updateDto, user?.id);
  }

  // --- Settings ---

  @Post('settings')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Set the organization settings' })
  async createSettings(
    @Body() createDto: CreateOrganizationSettingsDto,
    @CurrentUser() user: any,
  ) {
    return this.settingsService.create(createDto, user?.id);
  }

  @Patch('settings')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update the organization settings' })
  async updateSettings(
    @Body() updateDto: UpdateOrganizationSettingsDto,
    @CurrentUser() user: any,
  ) {
    return this.settingsService.update(updateDto, user?.id);
  }

  // --- Branch ---

  @Get('branch')
  @Permissions(PermissionEnum.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get all branches' })
  async getBranches(@CurrentUser() user: any) {
    return this.branchService.findAll(user);
  }

  @Post('branch')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Add a new branch' })
  async createBranch(
    @Body() createDto: CreateBranchDto,
    @CurrentUser() user: any,
  ) {
    return this.branchService.create(createDto, user?.id);
  }

  @Patch('branch/:id')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({
    summary:
      'Update a specific branch (also use this to assign managerId after employee is created)',
  })
  async updateBranch(
    @Param('id') id: string,
    @Body() updateDto: UpdateBranchDto,
    @CurrentUser() user: any,
  ) {
    return this.branchService.update(id, updateDto, user?.id);
  }

  @Delete('branch/:id')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Delete a branch' })
  async deleteBranch(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.branchService.delete(id, user?.id);
  }

  @Get('branch/:id/contact')
  @Permissions(PermissionEnum.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get all contacts for a specific branch' })
  async getBranchContacts(@Param('id') branchId: string, @CurrentUser() user: any) {
    return this.contactService.findByBranch(branchId, user);
  }

  @Post('branch/:id/contact')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({
    summary: 'Add a contact directly linked to a specific branch',
  })
  async createBranchContact(
    @Param('id') branchId: string,
    @Body() createDto: CreateOrganizationContactDto,
    @CurrentUser() user: any,
  ) {
    // Inject branchId from URL param (overrides body if provided)
    return this.contactService.create({ ...createDto, branchId }, user?.id);
  }

  // --- Contact ---

  @Get('contact')
  @Permissions(PermissionEnum.ORGANIZATION_READ)
  @ApiOperation({
    summary:
      'Get all org-level contacts (not linked to any specific branch). For branch contacts use GET /organization/branch/:id/contact',
  })
  async getContacts(@CurrentUser() user: any) {
    return this.contactService.findOrgLevel(user);
  }

  @Post('contact')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Add a new contact' })
  async createContact(
    @Body() createDto: CreateOrganizationContactDto,
    @CurrentUser() user: any,
  ) {
    return this.contactService.create(createDto, user?.id);
  }

  @Patch('contact/:id')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update a contact' })
  async updateContact(
    @Param('id') id: string,
    @Body() updateDto: UpdateOrganizationContactDto,
    @CurrentUser() user: any,
  ) {
    return this.contactService.update(id, updateDto, user?.id);
  }

  // --- Bank Account ---

  @Get('bank-account')
  @Permissions(PermissionEnum.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get all organization bank accounts' })
  async getBankAccounts(@CurrentUser() user: any) {
    return this.bankAccountService.findAll(user);
  }

  @Post('bank-account')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Add a new bank account' })
  async createBankAccount(
    @Body() createDto: CreateOrganizationBankAccountDto,
    @CurrentUser() user: any,
  ) {
    return this.bankAccountService.create(createDto, user?.id);
  }

  @Patch('bank-account/:id')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update a bank account' })
  async updateBankAccount(
    @Param('id') id: string,
    @Body() updateDto: UpdateOrganizationBankAccountDto,
    @CurrentUser() user: any,
  ) {
    return this.bankAccountService.update(id, updateDto, user?.id);
  }

  // --- Document ---

  @Get('document')
  @Permissions(PermissionEnum.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get all organization documents' })
  async getDocuments(@CurrentUser() user: any) {
    return this.documentService.findAll(user);
  }

  @Post('document')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Add a new document' })
  async createDocument(
    @Body() createDto: CreateOrganizationDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documentService.create(createDto, user?.id);
  }

  @Post('document/upload')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Upload an organization document file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentType: { type: 'string' },
        title: { type: 'string' },
        expiryDate: { type: 'string', format: 'date' },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/organization/documents',
        filename: (req, file, callback) => {
          const tempName = `org_doc_${Date.now()}${extname(file.originalname)}`;
          callback(null, tempName);
        },
      }),
      fileFilter: (req, file, callback) => {
        const allowedMimeTypes = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/jpg',
        ];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(new BadRequestException('Invalid file type'), false);
        }
        callback(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadDocument(
    @Body() body: any,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.documentService.uploadDocument(body, file, user?.id);
  }

  @Patch('document/:id')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update a document' })
  async updateDocument(
    @Param('id') id: string,
    @Body() updateDto: UpdateOrganizationDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documentService.update(id, updateDto, user?.id);
  }

  @Delete('document/:id')
  @Permissions(PermissionEnum.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Delete a document' })
  async deleteDocument(@Param('id') id: string, @CurrentUser() user: any) {
    return this.documentService.remove(id, user?.id);
  }
}
