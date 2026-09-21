import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { EmployeeDocument } from './entities/employee-document.entity';
import { IsNull, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { extname } from 'path';
import { DocumentTypeEnum } from '../../common/enums/document-type.enum';
import * as fs from 'fs';
import { TenantQueryService } from "../../common/services/tenant-query.service";
import { DataScopeService } from '../../common/services/data-scope.service';

@Injectable()
export class EmployeeDocumentsService {
  constructor(
    @InjectRepository(EmployeeDocument)
    private readonly employeeDocumentRepository: Repository<EmployeeDocument>,

    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>, 
    private readonly tenantQueryService: TenantQueryService,
    private readonly dataScopeService: DataScopeService
  ) {}

  async uploadDocument(
    employeeId: string,

    documentType: DocumentTypeEnum,

    file: Express.Multer.File,
    currentUser?: any,
  ) {
    const qb = this.employeeRepository.createQueryBuilder('employee')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('employee.deletedAt IS NULL')
      .andWhere('employee.tenantId = :tenantId', { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'employee.id',
      });
    }

    const employee = await qb.getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (!file) {
      throw new BadRequestException('File is required');
    }

    const extension = extname(file.originalname);

    const newFileName = `${employee.employeeCode}_${documentType}_${Date.now()}${extension}`;

    const oldPath = file.path;

    const newPath = `uploads/documents/${newFileName}`;

    fs.renameSync(oldPath, newPath);

    // SINGLE DOCUMENT TYPES
    const singleDocumentTypes = [
      DocumentTypeEnum.PAN,
      DocumentTypeEnum.AADHAAR,
      DocumentTypeEnum.RESUME,
      DocumentTypeEnum.OFFER_LETTER,
      DocumentTypeEnum.DEGREE,
      DocumentTypeEnum.EXPERIENCE_LETTER,
    ];

    if (singleDocumentTypes.includes(documentType)) {
      const existingDocument = await this.employeeDocumentRepository.findOne({
        where: {
          employeeId,
          documentType,
          deletedAt: IsNull(),
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      });

      if (existingDocument) {
        const existingFilePath = existingDocument.fileUrl.replace(
          '/uploads/',
          'uploads/',
        );

        if (fs.existsSync(existingFilePath)) {
          fs.unlinkSync(existingFilePath);
        }

        await this.employeeDocumentRepository.softDelete(existingDocument.id);
      }
    }

    const document = this.employeeDocumentRepository.create({
      employeeId,

      documentType,

      fileName: newFileName,

      fileUrl: `/uploads/documents/${newFileName}`,

      mimeType: file.mimetype,

      fileSize: file.size,
    });

    await this.employeeDocumentRepository.save(document);

    return {
      message: 'Document uploaded successfully',

      data: document,
    };
  }

  async getEmployeeDocuments(employeeId: string, currentUser?: any) {
    const qb = this.employeeRepository.createQueryBuilder('employee')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('employee.deletedAt IS NULL')
      .andWhere('employee.tenantId = :tenantId', { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'employee.id',
      });
    }

    const employee = await qb.getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const documents = await this.employeeDocumentRepository.find({
      where: {
        employeeId,

        deletedAt: IsNull(),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },

      order: {
        createdAt: 'DESC',
      },
    });

    return {
      data: documents,
    };
  }

  async deleteDocument(documentId: string, currentUser?: any) {
    const qb = this.employeeDocumentRepository.createQueryBuilder('document')
      .leftJoin('document.employee', 'employee')
      .where('document.id = :documentId', { documentId })
      .andWhere('document.deletedAt IS NULL')
      .andWhere('document.tenantId = :tenantId', { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });

    if (currentUser) {
      this.dataScopeService.applyScope(qb, currentUser, {
        branch: 'employee.branchId',
        department: 'employee.departmentId',
        employee: 'document.employeeId',
      });
    }

    const document = await qb.getOne();

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const filePath = document.fileUrl.replace('/uploads/', 'uploads/');

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await this.employeeDocumentRepository.softDelete(documentId);

    return {
      message: 'Document deleted successfully',
    };
  }
}
