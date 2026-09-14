import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { Course } from './entities/course.entity';
import { CourseModule } from './entities/course-module.entity';
import { CourseTopic } from './entities/course-topic.entity';
import { CourseMaterial } from './entities/course-material.entity';
import { Assessment } from './entities/assessment.entity';
import { AssessmentQuestion } from './entities/assessment-question.entity';
import { AssessmentOption } from './entities/assessment-option.entity';
import { CourseAssignment } from './entities/course-assignment.entity';
import { TopicProgress } from './entities/topic-progress.entity';
import { ModuleProgress } from './entities/module-progress.entity';
import { AssessmentAttempt } from './entities/assessment-attempt.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../departments/entities/department.entity';

import { CreateCourseDto } from './dto/create-course.dto';
import { CreateCourseModuleDto } from './dto/create-module.dto';
import { CreateCourseTopicDto } from './dto/create-topic.dto';
import { CreateCourseMaterialDto } from './dto/create-material.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { AssignCourseDto } from './dto/assign-course.dto';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import {
  UpdateCourseDto,
  UpdateCourseModuleDto,
  UpdateCourseTopicDto,
  UpdateCourseMaterialDto,
} from './dto/update-training.dto';
import { TenantQueryService } from "../../common/services/tenant-query.service";
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../common/enums/NotificationType.enum';

@Injectable()
export class TrainingService {
  constructor(
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(CourseModule)
    private moduleRepo: Repository<CourseModule>,
    @InjectRepository(CourseTopic) private topicRepo: Repository<CourseTopic>,
    @InjectRepository(CourseMaterial)
    private materialRepo: Repository<CourseMaterial>,
    @InjectRepository(Assessment)
    private assessmentRepo: Repository<Assessment>,
    @InjectRepository(AssessmentQuestion)
    private questionRepo: Repository<AssessmentQuestion>,
    @InjectRepository(AssessmentOption)
    private optionRepo: Repository<AssessmentOption>,
    @InjectRepository(CourseAssignment)
    private assignmentRepo: Repository<CourseAssignment>,
    @InjectRepository(TopicProgress)
    private topicProgressRepo: Repository<TopicProgress>,
    @InjectRepository(ModuleProgress)
    private moduleProgressRepo: Repository<ModuleProgress>,
    @InjectRepository(AssessmentAttempt)
    private attemptRepo: Repository<AssessmentAttempt>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(Department)
    private departmentRepo: Repository<Department>, 
    private readonly tenantQueryService: TenantQueryService,
    private readonly notificationService: NotificationService,
  ) {}

  // =====================
  // HR / ADMIN ENDPOINTS
  // =====================

  async createCourse(dto: CreateCourseDto, createdBy: string) {
    if (dto.departmentId) {
      const department = await this.departmentRepo.findOne({
        where: { id: dto.departmentId,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      });
      if (!department) throw new NotFoundException('Department not found');
    }
    const course = this.courseRepo.create({ ...dto, createdBy, tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });
    return this.courseRepo.save(course);
  }

  async addModule(courseId: string, dto: CreateCourseModuleDto) {
    const course = await this.courseRepo.findOne({ where: { id: courseId,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!course) throw new NotFoundException('Course not found');

    const duplicateTitle = await this.moduleRepo.findOne({
      where: { courseId, title: dto.title,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (duplicateTitle)
      throw new BadRequestException(
        'A module with this title already exists in the course',
      );

    const duplicateOrder = await this.moduleRepo.findOne({
      where: { courseId, sortOrder: dto.sortOrder,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (duplicateOrder)
      throw new BadRequestException(
        'A module with this sort order already exists in the course',
      );

    const module = this.moduleRepo.create({ ...dto, courseId, tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });
    return this.moduleRepo.save(module);
  }

  async addTopic(moduleId: string, dto: CreateCourseTopicDto) {
    const module = await this.moduleRepo.findOne({ where: { id: moduleId,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!module) throw new NotFoundException('Module not found');

    const duplicateTitle = await this.topicRepo.findOne({
      where: { moduleId, title: dto.title,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (duplicateTitle)
      throw new BadRequestException(
        'A topic with this title already exists in the module',
      );

    const duplicateOrder = await this.topicRepo.findOne({
      where: { moduleId, sortOrder: dto.sortOrder,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (duplicateOrder)
      throw new BadRequestException(
        'A topic with this sort order already exists in the module',
      );

    const topic = this.topicRepo.create({ ...dto, moduleId, tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });
    return this.topicRepo.save(topic);
  }

  async addMaterial(topicId: string, dto: CreateCourseMaterialDto) {
    const topic = await this.topicRepo.findOne({ where: { id: topicId,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!topic) throw new NotFoundException('Topic not found');

    const duplicateTitle = await this.materialRepo.findOne({
      where: { topicId, title: dto.title,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (duplicateTitle)
      throw new BadRequestException(
        'A material with this title already exists in the topic',
      );

    const duplicateOrder = await this.materialRepo.findOne({
      where: { topicId, sortOrder: dto.sortOrder,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (duplicateOrder)
      throw new BadRequestException(
        'A material with this sort order already exists in the topic',
      );

    const material = this.materialRepo.create({ ...dto, topicId, tenantId: this.tenantQueryService.getTenantWhereClause().tenantId });
    return this.materialRepo.save(material);
  }

  async createAssessment(moduleId: string, dto: CreateAssessmentDto) {
    const module = await this.moduleRepo.findOne({ where: { id: moduleId,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!module) throw new NotFoundException('Module not found');

    const existing = await this.assessmentRepo.findOne({ where: { moduleId,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (existing)
      throw new BadRequestException(
        'Assessment already exists for this module',
      );

    const assessment = await this.assessmentRepo.save({
      moduleId,
      title: dto.title,
      description: dto.description,
      passingPercentage: dto.passingPercentage ?? 40,
      tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
    });

    for (const q of dto.questions) {
      const question = await this.questionRepo.save({
        assessmentId: assessment.id,
        questionText: q.questionText,
        sortOrder: q.sortOrder,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
      });

      const optionsToSave = q.options.map((opt) => ({
        questionId: question.id,
        optionText: opt.optionText,
        isCorrect: opt.isCorrect,
        sortOrder: opt.sortOrder,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
      }));
      await this.optionRepo.save(optionsToSave);
    }

    return this.assessmentRepo.findOne({
      where: { id: assessment.id,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: { questions: { options: true } },
    });
  }

  async assignCourse(courseId: string, dto: AssignCourseDto) {
    const course = await this.courseRepo.findOne({
      where: { id: courseId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: { modules: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    let employees: Employee[] = [];

    if (dto.employeeIds && dto.employeeIds.length > 0) {
      const emps = await this.employeeRepo.find({
        where: { id: In(dto.employeeIds),
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      });
      employees.push(...emps);
    }

    if (dto.departmentId) {
      const deptEmps = await this.employeeRepo.find({
        where: { departmentId: dto.departmentId,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      });
      employees.push(...deptEmps);
    }

    if (!employees.length) {
      throw new BadRequestException(
        'Must provide valid employeeIds or departmentId (or both)',
      );
    }

    // Deduplicate employees in case they are in the department AND explicitly listed in employeeIds
    const uniqueMap = new Map<string, Employee>();
    for (const e of employees) {
      uniqueMap.set(e.id, e);
    }
    employees = Array.from(uniqueMap.values());

    const employeeIdsToAssign = employees.map((e) => e.id);
    const existing = await this.assignmentRepo.find({
      where: { courseId, employeeId: In(employeeIdsToAssign),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    const existingIds = new Set(existing.map((item) => item.employeeId));

    const newAssignments = employees
      .filter((emp) => !existingIds.has(emp.id))
      .map((emp) =>
        this.assignmentRepo.create({
          courseId,
          employeeId: emp.id,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
        }),
      );

    await this.assignmentRepo.save(newAssignments);

    for (const assignment of newAssignments) {
      await this.notificationService.createNotification({
        employeeId: assignment.employeeId,
        type: NotificationType.TRAINING,
        title: 'New Training Assigned',
        message: `You have been assigned to the course: "${course.title}".`,
        referenceId: course.id,
      });
    }

    // Give them access to the first module by default
    const firstModule = course.modules.sort(
      (a, b) => a.sortOrder - b.sortOrder,
    )[0];
    if (firstModule) {
      for (const assignment of newAssignments) {
        await this.moduleProgressRepo.save({
          employeeId: assignment.employeeId,
          moduleId: firstModule.id,
          isUnlocked: true,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
        });
      }
    }

    return { success: true, assignedCount: newAssignments.length };
  }

  async unassignCourse(courseId: string, employeeId: string) {
    const assignment = await this.assignmentRepo.findOne({
      where: { courseId, employeeId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    await this.assignmentRepo.remove(assignment);
    return { success: true };
  }

  // GET endpoints for HR
  async getAllCourses() {
    return this.courseRepo.find({
      relations: { department: true, creator: true },
      order: { createdAt: 'DESC' },
        where: { tenantId: this.tenantQueryService.getTenantWhereClause().tenantId }
    });
  }

  async getCourseById(id: string) {
    const course = await this.courseRepo.findOne({
      where: { id,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: {
        department: true,
        creator: true,
        modules: {
          topics: {
            materials: true,
          },
          assessment: {
            questions: {
              options: true,
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async getModuleById(id: string) {
    const module = await this.moduleRepo.findOne({
      where: { id,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: {
        topics: {
          materials: true,
        },
        assessment: {
          questions: {
            options: true,
          },
        },
      },
    });
    if (!module) throw new NotFoundException('Module not found');
    return module;
  }

  async getTopicById(id: string) {
    const topic = await this.topicRepo.findOne({
      where: { id,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: {
        materials: true,
      },
    });
    if (!topic) throw new NotFoundException('Topic not found');
    return topic;
  }

  async getCourseProgress(courseId: string) {
    return this.assignmentRepo.find({
      where: { courseId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: { employee: true },
      order: { progressPercentage: 'DESC' },
    });
  }

  async updateCourse(id: string, dto: UpdateCourseDto) {
    const course = await this.courseRepo.findOne({ where: { id,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!course) throw new NotFoundException('Course not found');
    Object.assign(course, dto);
    return this.courseRepo.save(course);
  }

  async deleteCourse(id: string) {
    const course = await this.courseRepo.findOne({ where: { id,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!course) throw new NotFoundException('Course not found');
    await this.courseRepo.remove(course);
    return { success: true };
  }

  async updateModule(id: string, dto: UpdateCourseModuleDto) {
    const module = await this.moduleRepo.findOne({ where: { id,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!module) throw new NotFoundException('Module not found');
    Object.assign(module, dto);
    return this.moduleRepo.save(module);
  }

  async deleteModule(id: string) {
    const module = await this.moduleRepo.findOne({ where: { id,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!module) throw new NotFoundException('Module not found');
    await this.moduleRepo.remove(module);
    return { success: true };
  }

  async updateTopic(id: string, dto: UpdateCourseTopicDto) {
    const topic = await this.topicRepo.findOne({ where: { id,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!topic) throw new NotFoundException('Topic not found');
    Object.assign(topic, dto);
    return this.topicRepo.save(topic);
  }

  async deleteTopic(id: string) {
    const topic = await this.topicRepo.findOne({ where: { id,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!topic) throw new NotFoundException('Topic not found');
    await this.topicRepo.remove(topic);
    return { success: true };
  }

  async updateMaterial(id: string, dto: UpdateCourseMaterialDto) {
    const material = await this.materialRepo.findOne({ where: { id,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!material) throw new NotFoundException('Material not found');
    Object.assign(material, dto);
    return this.materialRepo.save(material);
  }

  async deleteMaterial(id: string) {
    const material = await this.materialRepo.findOne({ where: { id,
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    } });
    if (!material) throw new NotFoundException('Material not found');
    await this.materialRepo.remove(material);
    return { success: true };
  }

  // =====================
  // EMPLOYEE ENDPOINTS
  // =====================

  async getMyCourses(employeeId: string) {
    const assignments = await this.assignmentRepo.find({
      where: { employeeId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: {
        course: {
          modules: {
            topics: true,
          },
        },
      },
      order: { assignedAt: 'DESC' },
    });

    const response: any[] = [];
    for (const assignment of assignments) {
      const course = assignment.course;
      const totalModules = course.modules.length;
      let totalTopics = 0;
      course.modules.forEach((m) => (totalTopics += m.topics.length));

      const moduleIds = course.modules.map((m) => m.id);
      const completedModules =
        moduleIds.length > 0
          ? await this.moduleProgressRepo.count({
              where: { employeeId, moduleId: In(moduleIds), isCompleted: true,
                  tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
            },
            })
          : 0;

      const topicIds = course.modules.flatMap((m) => m.topics.map((t) => t.id));
      const completedTopics =
        topicIds.length > 0
          ? await this.topicProgressRepo.count({
              where: { employeeId, topicId: In(topicIds), isCompleted: true,
                  tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
            },
            })
          : 0;

      response.push({
        assignmentId: assignment.id,
        assignedAt: assignment.assignedAt,
        isCompleted: assignment.isCompleted,
        courseId: course.id,
        courseTitle: course.title,
        courseDescription: course.description,
        dueDate: assignment.dueDate,
        analytics: {
          totalModules,
          completedModules,
          totalTopics,
          completedTopics,
        },
      });
    }

    return response;
  }

  async getCourseDetails(courseId: string, employeeId: string) {
    const assignment = await this.assignmentRepo.findOne({
      where: { courseId, employeeId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (!assignment) throw new NotFoundException('Course not assigned to you');

    const course = await this.courseRepo.findOne({
      where: { id: courseId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: {
        modules: {
          topics: {
            materials: true,
          },
          assessment: true,
        },
      },
    });

    if (!course) throw new NotFoundException('Course not found');

    // Only return modules they have unlocked
    const unlockedModules = await this.moduleProgressRepo.find({
      where: { employeeId, isUnlocked: true,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    const unlockedModuleIds = new Set(unlockedModules.map((m) => m.moduleId));

    course.modules = course.modules.filter((m) => unlockedModuleIds.has(m.id));

    return { assignment, course };
  }

  async completeTopic(topicId: string, employeeId: string) {
    const topic = await this.topicRepo.findOne({
      where: { id: topicId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: { module: true },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    const moduleAccess = await this.moduleProgressRepo.findOne({
      where: { employeeId, moduleId: topic.moduleId, isUnlocked: true,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (!moduleAccess) throw new BadRequestException('Module is locked');

    let progress = await this.topicProgressRepo.findOne({
      where: { topicId, employeeId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (!progress) {
      progress = this.topicProgressRepo.create({
        topicId,
        employeeId,
        isCompleted: true,
        completedAt: new Date(),
        tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
      });
    } else {
      progress.isCompleted = true;
      progress.completedAt = new Date();
    }

    await this.topicProgressRepo.save(progress);

    // Check if all topics in module are complete
    const allTopics = await this.topicRepo.find({
      where: { moduleId: topic.moduleId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    const allTopicProgress = await this.topicProgressRepo.find({
      where: { employeeId, topicId: In(allTopics.map((t) => t.id)),
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });

    const completedTopicIds = new Set(
      allTopicProgress.filter((p) => p.isCompleted).map((p) => p.topicId),
    );
    const allComplete = allTopics.every((t) => completedTopicIds.has(t.id));

    if (allComplete) {
      moduleAccess.isCompleted = true;
      moduleAccess.completedAt = new Date();
      await this.moduleProgressRepo.save(moduleAccess);
    }

    await this.recalculateCourseProgress(topic.module.courseId, employeeId);

    return progress;
  }

  async submitAssessment(
    moduleId: string,
    employeeId: string,
    dto: SubmitAssessmentDto,
  ) {
    // 1. Verify that the employee has completed all topics in this module first
    const moduleAccess = await this.moduleProgressRepo.findOne({
      where: { employeeId, moduleId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (!moduleAccess || !moduleAccess.isCompleted) {
      throw new BadRequestException(
        'You must complete all topics in this module before taking the assessment',
      );
    }

    const assessment = await this.assessmentRepo.findOne({
      where: { moduleId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: { questions: { options: true } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const totalQuestions = assessment.questions.length;
    let correctCount = 0;

    for (const question of assessment.questions) {
      const correctOptions = question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.id);
      // Assuming single choice for simplicity, or we can check if they selected all correct ones
      const userSelected = dto.selectedOptionIds.filter((id) =>
        question.options.some((o) => o.id === id),
      );

      if (
        userSelected.length === correctOptions.length &&
        userSelected.every((id) => correctOptions.includes(id))
      ) {
        correctCount++;
      }
    }

    const score =
      totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const passed = score >= assessment.passingPercentage;

    const attempt = await this.attemptRepo.save({
      employeeId,
      assessmentId: assessment.id,
      scorePercentage: score,
      passed,
      tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
    });

    const courseModule = await this.moduleRepo.findOne({
      where: { id: moduleId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (passed) {
      // Unlock next module
      if (courseModule) {
        const nextModule = await this.moduleRepo.findOne({
          where: {
            courseId: courseModule.courseId,
            sortOrder: courseModule.sortOrder + 1,
              tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
        });
        if (nextModule) {
          const access = await this.moduleProgressRepo.findOne({
            where: { employeeId, moduleId: nextModule.id,
                tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
            },
          });
          if (!access) {
            await this.moduleProgressRepo.save({
              employeeId,
              moduleId: nextModule.id,
              isUnlocked: true,
              tenantId: this.tenantQueryService.getTenantWhereClause().tenantId,
            });
          }
        } else {
          // If no next module, course is complete
          const assignment = await this.assignmentRepo.findOne({
            where: { employeeId, courseId: courseModule.courseId,
                tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
            },
          });
          if (assignment) {
            assignment.isCompleted = true;
            assignment.completedAt = new Date();
            await this.assignmentRepo.save(assignment);
          }
        }
      }
    }

    if (courseModule) {
      await this.recalculateCourseProgress(courseModule.courseId, employeeId);
    }

    return { score, passed, attempt };
  }

  private async recalculateCourseProgress(
    courseId: string,
    employeeId: string,
  ) {
    const course = await this.courseRepo.findOne({
      where: { id: courseId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
      relations: { modules: { topics: true } },
    });
    if (!course) return;

    const assignment = await this.assignmentRepo.findOne({
      where: { courseId, employeeId,
          tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
    },
    });
    if (!assignment) return;

    let totalTopics = 0;
    course.modules.forEach((m) => (totalTopics += m.topics.length));

    if (totalTopics === 0) {
      assignment.progressPercentage = 100;
    } else {
      const topicIds = course.modules.flatMap((m) => m.topics.map((t) => t.id));
      const completedTopics = await this.topicProgressRepo.count({
        where: { employeeId, topicId: In(topicIds), isCompleted: true,
            tenantId: this.tenantQueryService.getTenantWhereClause().tenantId
        },
      });
      assignment.progressPercentage = Math.round(
        (completedTopics / totalTopics) * 100,
      );
    }

    await this.assignmentRepo.save(assignment);
  }
}
