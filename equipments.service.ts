import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import * as dayjs from 'dayjs';
import * as weekday from 'dayjs/plugin/weekday';
import * as isToday from 'dayjs/plugin/isToday';

import {
  Between,
  DeepPartial,
  getConnection,
  getManager,
  ILike,
  In,
  Not,
  Repository,
} from 'typeorm';
import { BuildingLevel } from '../buildings/entities/building-level.entity';
import { BuildingRoom } from '../buildings/entities/building-room.entity';
import { Building } from '../buildings/entities/building.entity';
import { AppConfig } from '../configuration/configuration.service';
import { MaintenanceOperation } from '../maintenance-procedures/entities/maintenance-operation.entity';
import { MaintenanceOperationLabel } from '../maintenance-procedures/entities/maintenance-operation-label.entity';
import { MaintenanceOperationParameter } from '../maintenance-procedures/entities/maintenance-operation-parameter.entity';
import { MaintenanceProcedure } from '../maintenance-procedures/entities/maintenance-procedure.entity';
import { OperationTypes } from '../maintenance-procedures/enums/operation-types.enum';
import { Organization } from '../organizations/entities/organization.entity';
import { Project } from '../projects/entities/project.entity';
import { StandardEquipmentCategoryGroup } from '../standard-procedures/entities/standard-equipment-category-group.entity';
import { StandardOperation } from '../standard-procedures/entities/standard-operation.entity';
import { StandardOperationLabel } from '../standard-procedures/entities/standard-operation-label.entity';
import { StandardOperationParameter } from '../standard-procedures/entities/standard-operation-parameter.entity';
import { StandardProcedure } from '../standard-procedures/entities/standard-procedure.entity';
import { User } from '../users/entities/user.entity';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { Equipment } from './entities/equipment.entity';
import { EquipmentCategoryGroup } from './entities/equipment-category-group.entity';
import { EquipmentInput } from './entities/equipment-input.entity';
import { EquipmentModel } from './entities/equipment-model.entity';
import { EquipmentProjectCategory } from './entities/equipment-project-category.entity';
import { Manufacturer } from './entities/manufacturer.entity';
import { PmpEventsService } from '../pmp-events/pmp-events.service';
import { File } from '../files/entities/file.entity';
import { ErrorTypes } from '../error/enums/errorTypes.enum';
import { sanitizeWithRelations } from '../../util/util';
import { buildPaginationObject } from '../../util/pagination';
import { ProjectsService } from '../projects/projects.service';
import { PmpEventStatus } from '../pmp-events/enums/pmp-event-status';
import { Procurement } from '../procurements/entities/procurement.entity';
import { PmpEvent } from '../pmp-events/entities/pmp-event.entity';
import { BuildingsService } from '../buildings/buildings.service';
import { LocationScope } from '../buildings/enums/location-scope';
import {
  filterStringToObject,
  stringifyLocationFilter,
} from '../../util/filter';
import { isArray } from 'class-validator';
import { ProjectStatus } from '../projects/enums/project-status.enum';
import { EquipmentState } from './enums/equipment-state';
import { MaintenanceProceduresService } from '../maintenance-procedures/maintenance-procedures.service';

dayjs.extend(weekday);
dayjs.extend(isToday);
@Injectable()
export class EquipmentsService {
  constructor(
    @InjectRepository(Equipment)
    private equipmentsRepository: Repository<Equipment>,
    @InjectRepository(EquipmentProjectCategory)
    private equipmentProjectCategoriesRepository: Repository<EquipmentProjectCategory>,
    @InjectRepository(EquipmentCategoryGroup)
    private equipmentCategoryGroupsRepository: Repository<EquipmentCategoryGroup>,
    @InjectRepository(EquipmentModel)
    private equipmentModelsRepository: Repository<EquipmentModel>,
    @InjectRepository(Manufacturer)
    private manufacturersRepository: Repository<Manufacturer>,
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
    @InjectRepository(Building)
    private buildingsRepository: Repository<Building>,
    @InjectRepository(BuildingLevel)
    private buildingLevelsRepository: Repository<BuildingLevel>,
    @InjectRepository(BuildingRoom)
    private buildingRoomsRepository: Repository<BuildingRoom>,
    @InjectRepository(EquipmentInput)
    private equipmentInputsRepository: Repository<EquipmentInput>,
    @InjectRepository(StandardEquipmentCategoryGroup)
    private standardEquipmentCategoryGroupsRepository: Repository<StandardEquipmentCategoryGroup>,
    @InjectRepository(StandardProcedure)
    private standardProceduresRepository: Repository<StandardProcedure>,
    @InjectRepository(StandardOperation)
    private standardOperationsRepository: Repository<StandardOperation>,
    @InjectRepository(StandardOperationLabel)
    private standardOperationLabelsRepository: Repository<StandardOperationLabel>,
    @InjectRepository(StandardOperationParameter)
    private standardOperationParametersRepository: Repository<StandardOperationParameter>,
    @InjectRepository(MaintenanceProcedure)
    private maintenanceProceduresRepository: Repository<MaintenanceProcedure>,
    @InjectRepository(MaintenanceOperation)
    private maintenanceOperationsRepository: Repository<MaintenanceOperation>,
    @InjectRepository(MaintenanceOperationLabel)
    private maintenanceOperationLabelsRepository: Repository<MaintenanceOperationLabel>,
    @InjectRepository(MaintenanceOperationParameter)
    private maintenanceOperationParametersRepository: Repository<MaintenanceOperationParameter>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Procurement)
    private procurementsRepository: Repository<Procurement>,
    @InjectRepository(Organization)
    private organizationsRepository: Repository<Organization>,
    @InjectRepository(File)
    private filesRepository: Repository<File>,
    @InjectRepository(PmpEvent)
    private pmpEventsRepository: Repository<PmpEvent>,
    private readonly pmpEventService: PmpEventsService,
    private projectsService: ProjectsService,
    private buildingsService: BuildingsService,
    private maintenanceProceduresService: MaintenanceProceduresService,

    private config: AppConfig,
  ) {}

  async create(createEquipmentDto: CreateEquipmentDto, userId: number) {
    await this.projectsService.checkUserAccess(
      userId,
      createEquipmentDto.projectId,
      true,
    );
    const equipmentData: DeepPartial<Equipment> = {
      ...createEquipmentDto,
    };

    const equipmentModel = await this.equipmentModelsRepository.findOne(
      createEquipmentDto.equipmentModelId,
    );
    if (!equipmentModel)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_MODEL_NOT_FOUND);
    equipmentData.equipmentModel = equipmentModel;

    const manufacturer = await this.manufacturersRepository.findOne(
      createEquipmentDto.manufacturerId,
    );
    if (!manufacturer)
      throw new BadRequestException(
        ErrorTypes.EQUIPMENT_MANUFACTURER_NOT_FOUND,
      );
    equipmentData.manufacturer = manufacturer;

    const project = await this.projectsRepository.findOne(
      createEquipmentDto.projectId,
    );
    equipmentData.project = project;

    const standardCategoryGroup =
      await this.standardEquipmentCategoryGroupsRepository.findOne({
        where: { id: createEquipmentDto.standardCategoryGroupId },
        relations: ['category'],
      });
    if (!standardCategoryGroup)
      throw new BadRequestException(
        ErrorTypes.STANDARD_CATEGORY_GROUP_NOT_FOUND,
      );
    equipmentData.standardCategoryGroup = standardCategoryGroup;
    equipmentData.standardCategory = standardCategoryGroup.category;

    const equipmentCategoryGroup =
      await this.equipmentCategoryGroupsRepository.findOne({
        where: { id: createEquipmentDto.equipmentCategoryGroupId },
        relations: ['equipmentProjectCategory'],
      });
    if (!equipmentCategoryGroup)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_CATEGORY_NOT_FOUND);
    equipmentData.categoryGroup = equipmentCategoryGroup;
    equipmentData.projectCategory =
      equipmentCategoryGroup.equipmentProjectCategory;

    let equipmentLocations = null;
    if (typeof createEquipmentDto.locationDtos != 'undefined') {
      equipmentLocations = [];
      if (createEquipmentDto.locationDtos) {
        for (const location of createEquipmentDto.locationDtos) {
          location.projectId = createEquipmentDto.projectId;
          equipmentLocations.push(
            await this.buildingsService.addLocation(
              location,
              LocationScope.equipment,
            ),
          );
        }
      }
      equipmentData.locations = equipmentLocations;
    }

    let inputsDB = [];
    if (createEquipmentDto.inputs && createEquipmentDto.inputs.length > 0) {
      const inputsToCreate = [];
      for (const input of createEquipmentDto.inputs) {
        inputsToCreate.push(
          this.equipmentInputsRepository.create({
            ...input,
            unit: { id: input.unitId },
          }),
        );
      }
      inputsDB = await this.equipmentInputsRepository.save(inputsToCreate);
    }
    equipmentData.equipmentInputs = inputsDB;

    if (createEquipmentDto.mediaFileIds) {
      const files = [];
      for (const fileId of createEquipmentDto.mediaFileIds) {
        try {
          const file = await this.filesRepository.findOne(fileId);
          if (file) {
            files.push(file);
          }
        } catch (e) {}
      }
      equipmentData.mediaFiles = files;
    }

    if (createEquipmentDto.documentationFileIds) {
      const files = [];
      for (const fileId of createEquipmentDto.documentationFileIds) {
        try {
          const file = await this.filesRepository.findOne(fileId);
          if (file) {
            files.push(file);
          }
        } catch (e) {}
      }
      equipmentData.documentationFiles = files;
    }

    const equipment = await this.equipmentsRepository.save(equipmentData);
    const start = dayjs(project.startDate);
    const end = start.add(2, 'years');
    const standardProcedures = await this.standardProceduresRepository.find({
      where: {
        categoryGroup: { id: createEquipmentDto.standardCategoryGroupId },
      },
    });
    for (const standardProcedure of standardProcedures) {
      const maintenanceProcedure = this.maintenanceProceduresRepository.create({
        ...standardProcedure,
        equipment,
        id: null,
        isFromStandard: true,
      });
      await this.maintenanceProceduresRepository.save(maintenanceProcedure);

      await this.pmpEventService.createEventsForMaintenanceProcedure(
        start,
        end,
        maintenanceProcedure,
        project,
        equipment,
      );

      const standardOperations = await this.standardOperationsRepository.find({
        where: { procedure: standardProcedure },
      });
      for (const standardOperation of standardOperations) {
        const maintenanceOperation =
          this.maintenanceOperationsRepository.create({
            ...standardOperation,
            procedure: maintenanceProcedure,
            id: null,
          });
        await this.maintenanceOperationsRepository.save(maintenanceOperation);

        if (maintenanceOperation.type === OperationTypes.visual) {
          const standardOperationLabels =
            await this.standardOperationLabelsRepository.find({
              where: { operation: standardOperation },
            });
          for (const standardOperationLabel of standardOperationLabels) {
            const maintenanceOperationLabel =
              this.maintenanceOperationLabelsRepository.create({
                ...standardOperationLabel,
                operation: maintenanceOperation,
                id: null,
              });
            this.maintenanceOperationLabelsRepository.save(
              maintenanceOperationLabel,
            );
          }
        }

        if (maintenanceOperation.type === OperationTypes.parameter) {
          const standardOperationParameters =
            await this.standardOperationParametersRepository.find({
              where: { operation: standardOperation },
              relations: ['unit'],
            });
          for (const standardOperationParameter of standardOperationParameters) {
            const maintenanceOperationParameter =
              this.maintenanceOperationParametersRepository.create({
                ...standardOperationParameter,
                operation: maintenanceOperation,
                id: null,
              });
            this.maintenanceOperationParametersRepository.save(
              maintenanceOperationParameter,
            );
          }
        }
      }
    }

    //update project global updated at
    project.globalUpdatedAt = new Date();
    this.projectsRepository.save(project);

    return equipment;
  }

  async findAllInProject(
    projectId: number,
    categoryId: number,
    page: number,
    limit: number,
    filter: string,
    search = '',
    userId: number,
  ) {
    let equipmentsId: any[];

    await this.projectsService.checkUserAccess(userId, +projectId, false);

    const paginationObject = buildPaginationObject(page, limit);

    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['organization', 'roles'],
    });
    if (!user) throw new BadRequestException(ErrorTypes.USER_NOT_FOUND);

    let incomingFilterObject: any = {
      locations: {},
      all: {},
    };
    if (filter) {
      incomingFilterObject = filterStringToObject(filter);
    }

    if (Object.keys(incomingFilterObject.locations).length > 0) {
      const locationFilterString = stringifyLocationFilter(
        incomingFilterObject.locations,
      );

      equipmentsId = await getManager().query(`
          select distinct equipment.id from equipment
            left join equipment_locations_location ell on ell."equipmentId" = equipment.id
            left join location_building_rooms_building_room lbrbr on ell."locationId" = lbrbr."locationId"
              where ell."locationId" in (
                select id from location where ${locationFilterString}
            )
            group by equipment.id;
      `);
    }

    const query = getConnection()
      .createQueryBuilder(Equipment, 'equipment')
      .leftJoinAndSelect('equipment.categoryGroup', 'categoryGroup')
      .leftJoinAndSelect(
        'categoryGroup.equipmentProjectCategory',
        'equipmentProjectCategory',
      )
      .leftJoinAndSelect('equipment.project', 'project')
      .leftJoinAndSelect('equipment.locations', 'locations')
      .leftJoinAndSelect('locations.building', 'building')
      .leftJoinAndSelect('locations.buildingLevel', 'buildingLevel')
      .leftJoinAndSelect('locations.buildingRooms', 'buildingRooms')
      .leftJoinAndSelect(
        'equipment.maintenanceProcedures',
        'maintenanceProcedures',
      )
      .where('equipmentProjectCategory.project.id = :projectId', {
        projectId,
      })
      .andWhere(
        isArray(equipmentsId) && equipmentsId.length
          ? `equipment.id IN (:...equipmentIds)`
          : !isArray(equipmentsId)
          ? 'true'
          : 'false',
        {
          equipmentIds: equipmentsId?.map((item) => item.id),
        },
      )
      .andWhere('equipment.name iLike :name', { name: `%${search}%` });

    if (categoryId) {
      query.andWhere('equipmentProjectCategory.id = :categoryId', {
        categoryId,
      });
    }

    const [equipments, total] = await query
      .orderBy('equipment.id', 'ASC')
      .take(paginationObject.take)
      .skip(paginationObject.skip)
      .getManyAndCount();

    for (const equipmentCategoryGroup of equipments) {
      equipmentCategoryGroup.maintenanceProceduresCount =
        equipmentCategoryGroup.maintenanceProcedures.length;
      delete equipmentCategoryGroup.maintenanceProcedures;
    }

    return {
      total,
      data: equipments,
    };
  }

  async findAllByCategoryGroup(categoryGroupId: number) {
    const [equipments, totalCount] =
      await this.equipmentsRepository.findAndCount({
        where: { categoryGroup: { id: categoryGroupId } },
        relations: [
          'projectCategory',
          'categoryGroup',
          'equipmentModel',
          'manufacturer',
          'locations',
          'locations.building',
          'locations.buildingLevel',
          'locations.buildingRooms',
          'equipmentInputs',
          'equipmentInputs.unit',
          'maintenanceProcedures',
          'maintenanceProcedures.operations',
          'maintenanceProcedures.operations.labels',
          'maintenanceProcedures.operations.parameters',
          'maintenanceProcedures.operations.parameters.unit',
          'maintenanceProcedures.subcontractor',
          'linkedEquipments',
        ],
      });

    return {
      total: totalCount,
      data: equipments,
    };
  }

  async getProjectEquipmentTree(projectId: number, userId: number) {
    await this.projectsService.checkUserAccess(userId, +projectId, false);

    const equipmentTree = await this.equipmentProjectCategoriesRepository.find({
      where: { project: { id: projectId } },
      relations: [
        'equipmentCategoryGroups',
        'equipmentCategoryGroups.equipments',
        'equipmentCategoryGroups.equipments.maintenanceProcedures',
      ],
    });

    for (const equipmentProjectCategory of equipmentTree) {
      for (const equipmentCategoryGroup of equipmentProjectCategory.equipmentCategoryGroups) {
        for (const equipment of equipmentCategoryGroup.equipments) {
          equipment.maintenanceProceduresCount =
            equipment.maintenanceProcedures.length;
          delete equipment.maintenanceProcedures;
        }
      }
    }

    equipmentTree.sort((a, b) => a.id - b.id);

    return equipmentTree;
  }

  async getProjectCategories(projectId: number, userId: number) {
    await this.projectsService.checkUserAccess(userId, +projectId, false);

    const categories = await this.equipmentProjectCategoriesRepository.find({
      where: { project: { id: projectId } },
      relations: [
        'equipmentCategoryGroups',
        'equipmentCategoryGroups.equipments',
      ],
    });

    const categoriesAndCount = [];
    for (const category of categories) {
      let totalEq = 0;

      category.equipmentCategoryGroups.map((item) => {
        totalEq = totalEq + item.equipments.length;
      });

      categoriesAndCount.push({
        numberOfEquipments: totalEq,
        category: category.name,
        categoryId: category.id,
      });
    }

    categoriesAndCount.sort((a, b) => a.categoryId - b.categoryId);

    return categoriesAndCount;
  }

  async getProjectCategoryGroupsByProjectCategoriesNoCounts(
    projectId: number,
    userId: number,
  ) {
    await this.projectsService.checkUserAccess(userId, +projectId, false);

    const equipmentTree = await this.equipmentProjectCategoriesRepository.find({
      where: { project: { id: projectId } },
      relations: [
        'equipmentCategoryGroups',
        'equipmentCategoryGroups.equipments',
      ],
    });

    const equipmentTreeObj = equipmentTree.map((item) => {
      const result: any = item.toJSON();
      result.equipmentCategoryGroups = result.equipmentCategoryGroups.map(
        (item) => {
          return item.toJSON();
        },
      );
      return result;
    });

    return {
      equipmentProjectCategories: equipmentTreeObj,
    };
  }

  async getProjectCategoryGroupsByProjectCategories(
    projectId: number,
    userId: number,
  ) {
    await this.projectsService.checkUserAccess(userId, +projectId, false);

    const equipmentTree = await this.equipmentProjectCategoriesRepository.find({
      where: { project: { id: projectId } },
      relations: [
        'equipmentCategoryGroups',
        'equipmentCategoryGroups.equipments',
      ],
    });

    const equipmentTreeObj = equipmentTree.map((item) => {
      const result: any = item.toJSON();
      result.equipmentCategoryGroups = result.equipmentCategoryGroups.map(
        (item) => {
          return item.toJSON();
        },
      );
      return result;
    });

    let totalEq = 0;
    for (let i = 0; i < equipmentTreeObj.length; i++) {
      let total = 0;
      for (
        let j = 0;
        j < equipmentTreeObj[i].equipmentCategoryGroups.length;
        j++
      ) {
        equipmentTreeObj[i].equipmentCategoryGroups[j]['count'] =
          equipmentTreeObj[i].equipmentCategoryGroups[j].equipments.length;
        total += equipmentTreeObj[i].equipmentCategoryGroups[j]['count'];

        delete equipmentTreeObj[i].equipmentCategoryGroups[j].equipments;
      }
      equipmentTreeObj[i]['count'] = total;
      totalEq += total;
    }

    return {
      count: totalEq,
      equipmentProjectCategories: equipmentTreeObj,
    };
  }

  async findOne(id: number, withRelations: string, userId: number) {
    let extraRelations = [];
    if (withRelations) {
      extraRelations = sanitizeWithRelations(
        [
          'maintenanceProcedures',
          'maintenanceProcedures.operations',
          'maintenanceProcedures.operations.labels',
          'maintenanceProcedures.operations.parameters',
          'maintenanceProcedures.operations.parameters.unit',
          'maintenanceProcedures.subcontractor',
        ],
        withRelations,
      );
    }
    const equipment = await this.equipmentsRepository.findOne({
      where: { id },
      relations: [
        'projectCategory',
        'categoryGroup',
        'standardCategoryGroup',
        'standardCategory',
        'equipmentModel',
        'manufacturer',
        'project',
        'locations',
        'locations.building',
        'locations.buildingLevel',
        'locations.buildingRooms',
        'equipmentInputs',
        'equipmentInputs.unit',
        'mediaFiles',
        'documentationFiles',
        'linkedEquipments',
        ...extraRelations,
      ],
    });

    if (!equipment)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);
    await this.projectsService.checkUserAccess(
      userId,
      +equipment.project.id,
      false,
    );

    const standardProcedures = (equipment.maintenanceProcedures || []).filter(
      (item) => item.isFromStandard,
    );
    const additionalProcedures = (equipment.maintenanceProcedures || []).filter(
      (item) => !item.isFromStandard,
    );

    const response = {
      ...equipment,
    };
    if (withRelations) {
      if (
        withRelations === 'all' ||
        withRelations.includes('maintenanceProcedures')
      ) {
        response['standardProcedures'] = standardProcedures;
        response['additionalProcedures'] = additionalProcedures;
      }
    }

    return response;
  }

  async getEquipmentDetails(equipmentId: number, userId: number) {
    const equipment = await this.equipmentsRepository.findOne({
      where: { id: equipmentId },
      relations: [
        'projectCategory',
        'categoryGroup',
        'standardCategoryGroup',
        'standardCategory',
        'equipmentModel',
        'manufacturer',
        'project',
        'locations',
        'locations.building',
        'locations.buildingLevel',
        'locations.buildingRooms',
        'equipmentInputs',
        'equipmentInputs.unit',
        'mediaFiles',
        'documentationFiles',
        'linkedEquipments',
      ],
    });
    if (!equipment)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);

    await this.projectsService.checkUserAccess(
      userId,
      +equipment.project.id,
      false,
    );
    delete equipment.project;

    return equipment;
  }

  async historyProcurements(id: number, page = 0, limit = 0, userId: number) {
    const equipment = await this.equipmentsRepository.findOne({
      where: { id },
      relations: ['project', 'procurements'],
    });
    if (!equipment)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);

    await this.projectsService.checkUserAccess(
      userId,
      +equipment.project.id,
      false,
    );

    const paginationObject = buildPaginationObject(page, limit);

    const [procurements, totalCount] =
      await this.procurementsRepository.findAndCount({
        where: {
          id: In(equipment.procurements.map((procurement) => procurement.id)),
        },
        ...paginationObject,
        order: { id: 'DESC' },
      });

    return {
      total: totalCount,
      data: procurements,
    };
  }

  async historyForMaintenanceProcedure(
    id: number,
    maintenanceProcedureId: number,
    page = 0,
    limit = 0,
    userId: number,
  ) {
    const equipment = await this.equipmentsRepository.findOne({
      where: { id },
      relations: ['project'],
    });
    if (!equipment)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);

    await this.projectsService.checkUserAccess(
      userId,
      +equipment.project.id,
      false,
    );

    const maintenanceProcedure =
      await this.maintenanceProceduresRepository.findOne({
        where: { id: maintenanceProcedureId, equipmentId: id },
      });

    if (!maintenanceProcedure)
      throw new BadRequestException(ErrorTypes.MAINTENANCE_PROCEDURE_NOT_FOUND);

    const paginationObject = buildPaginationObject(page, limit);

    const [events, totalCount] = await this.pmpEventsRepository.findAndCount({
      // withDeleted: true,
      where: {
        procedure: maintenanceProcedure,
        status: PmpEventStatus.planned,
      },
      ...paginationObject,
      relations: ['operationsData', 'measurements'],
    });

    return {
      total: totalCount,
      data: events,
    };
  }

  async update(id: number, updateEquipmentDto: UpdateEquipmentDto, userId) {
    const equipmentToUpdate = await this.equipmentsRepository.findOne({
      where: { id },
      relations: ['project', 'projectCategory'],
    });

    if (!equipmentToUpdate)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);
    if (equipmentToUpdate.isReadonly)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_IS_READ_ONLY);

    await this.projectsService.checkUserAccess(
      userId,
      +equipmentToUpdate.project.id,
      true,
    );

    if (updateEquipmentDto.state) {
      const statusesRouting: Map<string, Array<string>> = new Map([
        ['draft', ['active', 'draft']],
        ['active', ['active']],
        ['disabled', ['disabled']],
        ['archived', ['archived']],
      ]);

      if (
        !statusesRouting
          .get(equipmentToUpdate.state)
          .includes(updateEquipmentDto.state)
      ) {
        throw new BadRequestException(
          ErrorTypes.EQUIPMENT_STATUS_CHANGE_ROUTING_ERROR,
        );
      }
    }

    const today = dayjs()
      .set('hour', 0)
      .set('minute', 0)
      .set('second', 0)
      .set('millisecond', 0);

    const project = equipmentToUpdate.project;
    if (project.status == ProjectStatus.archived) {
      throw new BadRequestException(
        ErrorTypes.EQUIPMENT_UPDATE_FAILED_PROJECT_IS_ARCHIVED,
      );
    }

    if (
      equipmentToUpdate.state == EquipmentState.draft &&
      updateEquipmentDto.state == EquipmentState.active
    ) {
      await this.pmpEventService.changeEventsFromDraftToPlannedForEquipment(
        equipmentToUpdate.id,
      );
    }

    const equipmentData: DeepPartial<Equipment> = {
      ...updateEquipmentDto,
    };

    if (updateEquipmentDto.equipmentModelId) {
      const equipmentModel = await this.equipmentModelsRepository.findOne(
        updateEquipmentDto.equipmentModelId,
      );
      if (!equipmentModel)
        throw new BadRequestException(ErrorTypes.EQUIPMENT_MODEL_NOT_FOUND);
      equipmentData.equipmentModel = equipmentModel;
    }

    if (updateEquipmentDto.manufacturerId) {
      const manufacturer = await this.manufacturersRepository.findOne(
        updateEquipmentDto.manufacturerId,
      );
      if (!manufacturer)
        throw new BadRequestException(
          ErrorTypes.EQUIPMENT_MANUFACTURER_NOT_FOUND,
        );
      equipmentData.manufacturer = manufacturer;
    }

    let equipmentLocations = null;
    if (typeof updateEquipmentDto.locationDtos != 'undefined') {
      equipmentLocations = [];
      if (updateEquipmentDto.locationDtos) {
        for (const location of updateEquipmentDto.locationDtos) {
          location.projectId = updateEquipmentDto.projectId;
          equipmentLocations.push(
            await this.buildingsService.addLocation(
              location,
              LocationScope.equipment,
            ),
          );
        }
      }
      equipmentData.locations = equipmentLocations;
    }

    if (updateEquipmentDto.inputs) {
      let inputsDB = [];
      const inputsToCreate = [];
      await this.equipmentInputsRepository.delete({ equipment: { id } });
      for (const input of updateEquipmentDto.inputs) {
        inputsToCreate.push(
          this.equipmentInputsRepository.create({
            ...input,
            unit: { id: input.unitId },
          }),
        );
      }
      inputsDB = await this.equipmentInputsRepository.save(inputsToCreate);
      equipmentData.equipmentInputs = inputsDB;
    }

    if (updateEquipmentDto.mediaFileIds) {
      const files = [];
      for (const fileId of updateEquipmentDto.mediaFileIds) {
        try {
          const file = await this.filesRepository.findOne(fileId);
          if (file) {
            files.push(file);
          }
        } catch (e) {}
      }
      equipmentData.mediaFiles = files;
    }

    if (updateEquipmentDto.documentationFileIds) {
      const files = [];
      for (const fileId of updateEquipmentDto.documentationFileIds) {
        try {
          const file = await this.filesRepository.findOne(fileId);
          if (file) {
            files.push(file);
          }
        } catch (e) {}
      }
      equipmentData.documentationFiles = files;
    }

    if (updateEquipmentDto.equipmentCategoryGroupId) {
      const equipmentCategoryGroup =
        await this.equipmentCategoryGroupsRepository.findOne(
          updateEquipmentDto.equipmentCategoryGroupId,
        );
      if (!equipmentCategoryGroup)
        throw new BadRequestException(ErrorTypes.EQUIPMENT_CATEGORY_NOT_FOUND);
      equipmentData.categoryGroup = equipmentCategoryGroup;
    }

    equipmentData['id'] = id;

    const equipment = await this.equipmentsRepository.preload(equipmentData);
    await this.equipmentsRepository.save(equipment);

    //update project global updated at
    equipmentToUpdate.project.globalUpdatedAt = new Date();
    this.projectsRepository.save(equipmentToUpdate.project);

    return true;
  }

  async disableEquipment(
    userId: number,
    equipmentId: number,
    toggleDate: dayjs.Dayjs,
  ) {
    const equipment = await this.equipmentsRepository.findOne({
      where: { id: equipmentId },
      relations: ['project', 'maintenanceProcedures'],
    });
    if (!equipment)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);

    await this.projectsService.checkUserAccess(
      userId,
      equipment.project.id,
      true,
    );

    if (equipment.state != EquipmentState.active)
      throw new BadRequestException(
        ErrorTypes.EQUIPMENT_CAN_ONLY_BE_DISABLED_IF_ACTIVE,
      );

    // disable all maintenance procedures alongside disabling the equipment
    if (equipment.maintenanceProcedures) {
      for (const maintenanceProcedure of equipment.maintenanceProcedures) {
        await this.maintenanceProceduresService.disableMaintenanceProcedure(
          maintenanceProcedure.id,
          toggleDate,
          userId,
        );
      }
    }

    if (toggleDate.isToday()) {
      equipment.state = EquipmentState.disabled;
      equipment.toggleDate = null;
      equipment.isReadonly = true;
    } else {
      equipment.toggleDate = toggleDate.toDate();
    }

    await this.equipmentsRepository.save(equipment);

    return equipment;
  }

  // also used to move equipment from "archived" to "active" state
  async enableEquipment(
    userId: number,
    equipmentId: number,
    toggleDate: dayjs.Dayjs,
  ) {
    const equipment = await this.equipmentsRepository.findOne({
      where: { id: equipmentId },
      relations: ['project', 'maintenanceProcedures'],
    });
    if (!equipment)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);

    await this.projectsService.checkUserAccess(
      userId,
      equipment.project.id,
      true,
    );

    if (
      equipment.state != EquipmentState.disabled &&
      equipment.state != EquipmentState.archived
    )
      throw new BadRequestException(
        ErrorTypes.EQUIPMENT_CAN_ONLY_BE_ENABLED_IF_DISABLED_OR_ARCHIVED,
      );

    const today = dayjs()
      .set('hour', 0)
      .set('minute', 0)
      .set('second', 0)
      .set('millisecond', 0);

    // enable all maintenance procedures alongside enabling the equipment
    for (const maintenanceProcedure of equipment.maintenanceProcedures) {
      await this.maintenanceProceduresService.enableMaintenanceProcedure(
        maintenanceProcedure.id,
        toggleDate,
        userId,
      );
    }

    if (toggleDate.isToday()) {
      equipment.state = EquipmentState.active;
      equipment.toggleDate = null;
      equipment.isReadonly = false;
    } else {
      equipment.toggleDate = toggleDate.toDate();
    }

    await this.equipmentsRepository.save(equipment);

    return equipment;
  }

  // we can also archieve disabled equipment
  async archiveEquipment(userId: number, equipmentId: number) {
    const equipment = await this.equipmentsRepository.findOne({
      where: { id: equipmentId },
      relations: ['project', 'maintenanceProcedures'],
    });
    if (!equipment)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);

    await this.projectsService.checkUserAccess(
      userId,
      equipment.project.id,
      true,
    );

    const today = dayjs()
      .set('hour', 0)
      .set('minute', 0)
      .set('second', 0)
      .set('millisecond', 0);

    // disable all maintenance procedures alongside archiving the equipment
    if (equipment.maintenanceProcedures) {
      for (const maintenanceProcedure of equipment.maintenanceProcedures) {
        await this.maintenanceProceduresService.disableMaintenanceProcedure(
          maintenanceProcedure.id,
          today,
          userId,
        );
      }
    }
    equipment.state = EquipmentState.archived;
    equipment.isReadonly = true;

    await this.equipmentsRepository.save(equipment);

    return equipment;
  }

  async toggleEquipmentState() {
    const today = dayjs()
      .set('hour', 0)
      .set('minute', 0)
      .set('second', 0)
      .set('millisecond', 0);

    const equipments = await this.equipmentsRepository.find({
      where: { toggleDate: Not('archived') },
    });

    for (const equipment of equipments) {
      if (equipment.toggleDate == today.toDate()) {
        if ((equipment.state = EquipmentState.active)) {
          equipment.state = EquipmentState.disabled;
        } else {
          equipment.state = EquipmentState.active;
        }

        await this.equipmentsRepository.save(equipment);
      }
    }
  }

  async remove(id: number, userId: number) {
    const equipment = await this.equipmentsRepository.findOne({
      where: { id },
      relations: ['project'],
    });
    if (!equipment)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);
    if (!equipment.isDeletable)
      throw new BadRequestException(
        ErrorTypes.UNABLE_TO_DELETE_EQUIPMENT_NOT_DELETABLE,
      );
    if (equipment.isReadonly)
      throw new BadRequestException(
        ErrorTypes.UNABLE_TO_DELETE_EQUIPMENT_READ_ONLY,
      );

    await this.projectsService.checkUserAccess(
      userId,
      +equipment.project.id,
      true,
    );

    try {
      await this.equipmentsRepository.delete({ id: id });
    } catch (e) {
      if (e.code == 23503) {
        throw new BadRequestException(
          ErrorTypes.UNABLE_TO_DELETE_EQUIPMENT_FK_CONSTRAINT,
        );
      }
    }
    return true;
  }

  async makeReadonly(id: number, userId: number) {
    const equipment = await this.equipmentsRepository.findOne({
      where: { id },
      relations: ['maintenanceProcedures', 'project'],
    });
    if (!equipment)
      throw new BadRequestException(ErrorTypes.EQUIPMENT_NOT_FOUND);

    await this.projectsService.checkUserAccess(
      userId,
      +equipment.project.id,
      true,
    );

    if (equipment.isReadonly) return true;

    equipment.isReadonly = true;
    await this.equipmentsRepository.save(equipment);

    for (const maintenanceProcedure of equipment.maintenanceProcedures) {
      await this.pmpEventService.removeEventsForMaintenanceProcedure(
        maintenanceProcedure,
        equipment.project,
        dayjs(equipment.project.startDate),
      );
    }

    return true;
  }

  async linkEquipmentToEquipment(
    sourceEquipmentId: number,
    destinationEquipmentId: number,
    userId: number,
  ) {
    const equipmentSource = await this.equipmentsRepository.findOne({
      where: { id: sourceEquipmentId },
      relations: ['linkedEquipments', 'project'],
    });
    if (!equipmentSource)
      throw new BadRequestException(ErrorTypes.SOURCE_EQUIPMENT_NOT_FOUND);

    await this.projectsService.checkUserAccess(
      userId,
      +equipmentSource.project.id,
      true,
    );

    const equipmentDestination = await this.equipmentsRepository.findOne({
      where: { id: destinationEquipmentId },
      relations: ['linkedEquipments', 'project'],
    });
    if (!equipmentDestination)
      throw new BadRequestException(ErrorTypes.BUILDING_LEVEL_NOT_FOUND);

    if (equipmentDestination.project.id != equipmentSource.project.id)
      throw new BadRequestException(
        ErrorTypes.BOTH_EQUIPMENTS_MUST_BE_IN_SAME_PROJECT,
      );

    const equipmentIndexSource = equipmentSource.linkedEquipments.findIndex(
      (equipment) => equipment.id === destinationEquipmentId,
    );
    if (equipmentIndexSource === -1) {
      equipmentSource.linkedEquipments.push(equipmentDestination);
      await this.equipmentsRepository.save(equipmentSource);
    }

    const equipmentIndexDesttination =
      equipmentDestination.linkedEquipments.findIndex(
        (equipment) => equipment.id === sourceEquipmentId,
      );
    if (equipmentIndexDesttination === -1) {
      equipmentDestination.linkedEquipments.push(equipmentSource);
      await this.equipmentsRepository.save(equipmentDestination);
    }
    return true;
  }

  async unlinkEquipmentFromEquipment(
    sourceEquipmentId: number,
    destinationEquipmentId: number,
    userId: number,
  ) {
    const equipmentSource = await this.equipmentsRepository.findOne({
      where: { id: sourceEquipmentId },
      relations: ['linkedEquipments', 'project'],
    });
    if (!equipmentSource)
      throw new BadRequestException(ErrorTypes.SOURCE_EQUIPMENT_NOT_FOUND);

    await this.projectsService.checkUserAccess(
      userId,
      +equipmentSource.project.id,
      true,
    );

    const equipmentDestination = await this.equipmentsRepository.findOne({
      where: { id: destinationEquipmentId },
      relations: ['linkedEquipments'],
    });
    if (!equipmentDestination)
      throw new BadRequestException(ErrorTypes.BUILDING_LEVEL_NOT_FOUND);

    const equipmentIndexSource = equipmentSource.linkedEquipments.findIndex(
      (equipment) => equipment.id === destinationEquipmentId,
    );
    if (equipmentIndexSource !== -1) {
      equipmentSource.linkedEquipments.splice(equipmentIndexSource, 1);
      await this.equipmentsRepository.save(equipmentSource);
    }

    const equipmentIndexDestination =
      equipmentDestination.linkedEquipments.findIndex(
        (equipment) => equipment.id === sourceEquipmentId,
      );
    if (equipmentIndexDestination !== -1) {
      equipmentDestination.linkedEquipments.splice(
        equipmentIndexDestination,
        1,
      );
      await this.equipmentsRepository.save(equipmentDestination);
    }
    return true;
  }

  async search(
    namePart: string,
    projectId: number,
    userId: number,
    page = 0,
    limit = 0,
  ) {
    await this.projectsService.checkUserAccess(userId, +projectId, false);

    const paginationObject = buildPaginationObject(page, limit);

    const count = await this.equipmentsRepository.count({
      where: {
        name: ILike(`%${namePart}%`),
        project: { id: projectId },
      },
    });

    const data = await this.equipmentsRepository.find({
      where: {
        name: ILike(`%${namePart}%`),
        project: { id: projectId },
      },
      ...paginationObject,
    });
    return {
      total: count,
      data,
    };
  }
}
