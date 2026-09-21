import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';

import { diskStorage } from 'multer';

import { extname } from 'path';

import { EmployeeDocumentsService } from './employee-documents.service';

import { UploadEmployeeDocumentDto } from './dto/upload-employee-document.dto';
import {
  Permissions,
  PERMISSIONS_KEY,
} from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PermissionEnum } from 'src/common/enums/permission.enum';
import { PermissionsService } from '../permissions/permissions.service';

@Controller('employees/:id/documents')
export class EmployeeDocumentsController {
  constructor(
    private readonly employeeDocumentsService: EmployeeDocumentsService,
  ) {}

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/documents',

        filename: (req, file, callback) => {
          const tempName = `temp_${Date.now()}${extname(file.originalname)}`;

          callback(null, tempName);
        },
      }),

      fileFilter: (req, file, callback) => {
        const allowedMimeTypes = [
          'application/pdf',

          'image/jpeg',
          'image/png',
          'image/jpg',
          'image/webp',

          'application/msword',

          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(new BadRequestException('Invalid file type'), false);
        }

        callback(null, true);
      },

      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  uploadDocument(
    @Param('id', ParseUUIDPipe)
    employeeId: string,

    @Body()
    dto: UploadEmployeeDocumentDto,

    @UploadedFile()
    file: Express.Multer.File,

    @CurrentUser() user: any,
  ) {
    return this.employeeDocumentsService.uploadDocument(
      employeeId,
      dto.documentType,
      file,
      user,
    );
  }

  @Permissions(PermissionEnum.EMPLOYEE_READ)
  @Get()
  getDocuments(
    @Param('id', ParseUUIDPipe)
    employeeId: string,
    @CurrentUser() user: any,
  ) {
    return this.employeeDocumentsService.getEmployeeDocuments(employeeId, user);
  }

  @Permissions(PermissionEnum.EMPLOYEE_UPDATE)
  @Delete(':documentId')
  deleteDocument(
    @Param('documentId', ParseUUIDPipe)
    documentId: string,
    @CurrentUser() user: any,
  ) {
    return this.employeeDocumentsService.deleteDocument(documentId, user);
  }
}
