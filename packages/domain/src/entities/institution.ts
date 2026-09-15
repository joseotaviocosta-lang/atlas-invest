import { InstitutionId, createInstitutionId } from '../primitives/domain-id';
import { InstitutionType } from '../ledger/types';
import { InvalidEntityError } from '../errors/domain-error';

export interface InstitutionProps {
  id: InstitutionId;
  name: string;
  type: InstitutionType;
  country: string;
}

export interface InstitutionJSON {
  id: string;
  name: string;
  type: InstitutionType;
  country: string;
}

export class Institution {
  readonly id: InstitutionId;
  readonly name: string;
  readonly type: InstitutionType;
  readonly country: string;

  private constructor(props: InstitutionProps) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.country = props.country;
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    name: string;
    type: InstitutionType;
    country: string;
  }): Institution {
    if (!props.name || props.name.trim() === '') {
      throw new InvalidEntityError('Institution name cannot be empty');
    }
    if (!props.country || props.country.trim() === '') {
      throw new InvalidEntityError('Institution country cannot be empty');
    }

    return new Institution({
      id: createInstitutionId(props.id),
      name: props.name.trim(),
      type: props.type,
      country: props.country.trim().toUpperCase(),
    });
  }

  equals(other: Institution): boolean {
    if (!other || !(other instanceof Institution)) {
      return false;
    }
    return this.id === other.id;
  }

  toJSON(): InstitutionJSON {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      country: this.country,
    };
  }
}
